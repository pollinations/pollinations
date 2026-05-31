import type { Usage, UsageType } from "./registry.ts";

/**
 * Mapping from Usage field names to HTTP header names
 */
export const USAGE_TYPE_HEADERS: Record<UsageType, string> = {
    promptTextTokens: "x-usage-prompt-text-tokens",
    promptCachedTokens: "x-usage-prompt-cached-tokens",
    promptCacheWriteTokens: "x-usage-prompt-cache-write-tokens",
    promptAudioTokens: "x-usage-prompt-audio-tokens",
    promptAudioSeconds: "x-usage-prompt-audio-seconds",
    promptImageTokens: "x-usage-prompt-image-tokens",
    promptVideoTokens: "x-usage-prompt-video-tokens",
    completionTextTokens: "x-usage-completion-text-tokens",
    completionReasoningTokens: "x-usage-completion-reasoning-tokens",
    completionAudioTokens: "x-usage-completion-audio-tokens",
    completionAudioSeconds: "x-usage-completion-audio-seconds",
    completionImageTokens: "x-usage-completion-image-tokens",
    completionVideoSeconds: "x-usage-completion-video-seconds",
    completionVideoTokens: "x-usage-completion-video-tokens",
};

/**
 * Convert OpenAI usage format to Usage format.
 *
 * The OpenAI spec defines `completion_tokens` (and `prompt_tokens`) as the
 * inclusive grand total, with `*_details` subcategories that sum into it.
 * Some providers violate or extend this: Grok/xAI reasoning can report
 * reasoning as an additive counter separate from completion_tokens. Others
 * have returned inconsistent inclusive details greater than the headline
 * count, which we cap to avoid impossible negative usage.
 *
 * We detect the convention per-row from `total_tokens`. If total_tokens is
 * prompt + completion, details are inclusive subcategories. If total_tokens
 * includes detail counters beyond prompt + completion, only the matching
 * detail bucket is additive and the related top-level count is already the
 * visible-text count.
 */
export function openaiUsageToUsage(openaiUsage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_tokens_details?: {
        cached_tokens?: number | null;
        audio_tokens?: number | null;
        image_tokens?: number | null;
    } | null;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
    completion_tokens_details?: {
        reasoning_tokens?: number | null;
        audio_tokens?: number | null;
        accepted_prediction_tokens?: number | null;
        rejected_prediction_tokens?: number | null;
    } | null;
}): Usage {
    const promptCachedTokens =
        openaiUsage.prompt_tokens_details?.cached_tokens ||
        openaiUsage.cache_read_input_tokens ||
        0;
    const promptCacheWriteTokens = openaiUsage.cache_creation_input_tokens ?? 0;
    const promptDetails = [
        promptCachedTokens,
        promptCacheWriteTokens,
        openaiUsage.prompt_tokens_details?.audio_tokens || 0,
        openaiUsage.prompt_tokens_details?.image_tokens || 0,
    ];

    const rawCompletionReasoningTokens =
        openaiUsage.completion_tokens_details?.reasoning_tokens || 0;
    const completionDetails = [
        openaiUsage.completion_tokens_details?.accepted_prediction_tokens || 0,
        openaiUsage.completion_tokens_details?.rejected_prediction_tokens || 0,
        openaiUsage.completion_tokens_details?.audio_tokens || 0,
        rawCompletionReasoningTokens,
    ];

    const promptDetailTokens = sumTokens(promptDetails);
    const completionDetailTokens = sumTokens(completionDetails);
    const { promptDetailsAreAdditive, completionDetailsAreAdditive } =
        detectUsageConvention(
            openaiUsage,
            promptDetailTokens,
            completionDetailTokens,
            rawCompletionReasoningTokens,
        );

    const cappedPromptDetails = promptDetailsAreAdditive
        ? promptDetails
        : capDetailsToTotal(openaiUsage.prompt_tokens, promptDetails);
    const cappedCompletionDetails = completionDetailsAreAdditive
        ? completionDetails
        : capDetailsToTotal(openaiUsage.completion_tokens, completionDetails);

    const promptTextTokens = promptDetailsAreAdditive
        ? openaiUsage.prompt_tokens
        : openaiUsage.prompt_tokens - sumTokens(cappedPromptDetails);

    const completionTextTokens = completionDetailsAreAdditive
        ? openaiUsage.completion_tokens
        : openaiUsage.completion_tokens - sumTokens(cappedCompletionDetails);

    const [
        cappedPromptCachedTokens,
        cappedPromptCacheWriteTokens,
        promptAudioTokens,
        promptImageTokens,
    ] = cappedPromptDetails;
    const [, , completionAudioTokens, completionReasoningTokens] =
        cappedCompletionDetails;

    return {
        promptTextTokens,
        promptCachedTokens: cappedPromptCachedTokens,
        promptCacheWriteTokens: cappedPromptCacheWriteTokens,
        promptAudioTokens,
        promptImageTokens,
        completionTextTokens,
        completionAudioTokens,
        completionReasoningTokens,
    };
}

function sumTokens(tokens: readonly number[]): number {
    return tokens.reduce((sum, token) => sum + token, 0);
}

function capDetailsToTotal(totalTokens: number, details: number[]): number[] {
    let remaining = totalTokens;
    return details.map((token) => {
        const capped = Math.min(token, remaining);
        remaining -= capped;
        return capped;
    });
}

function detectUsageConvention(
    openaiUsage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    },
    promptDetailTokens: number,
    completionDetailTokens: number,
    completionReasoningTokens: number,
): {
    promptDetailsAreAdditive: boolean;
    completionDetailsAreAdditive: boolean;
} {
    const topLevelTotal =
        openaiUsage.prompt_tokens + openaiUsage.completion_tokens;
    const additiveDetails = openaiUsage.total_tokens - topLevelTotal;

    if (additiveDetails <= 0) {
        return {
            promptDetailsAreAdditive: false,
            completionDetailsAreAdditive: false,
        };
    }

    if (additiveDetails === promptDetailTokens + completionDetailTokens) {
        return {
            promptDetailsAreAdditive: promptDetailTokens > 0,
            completionDetailsAreAdditive: completionDetailTokens > 0,
        };
    }

    // Known additive Grok/xAI rows expose the extra total as reasoning tokens.
    if (
        completionReasoningTokens > 0 &&
        additiveDetails === completionReasoningTokens
    ) {
        return {
            promptDetailsAreAdditive: false,
            completionDetailsAreAdditive: true,
        };
    }

    const promptOnly =
        additiveDetails === promptDetailTokens &&
        promptDetailTokens !== completionDetailTokens;
    const completionOnly =
        additiveDetails === completionDetailTokens &&
        promptDetailTokens !== completionDetailTokens;

    return {
        promptDetailsAreAdditive: promptOnly,
        completionDetailsAreAdditive: completionOnly,
    };
}

/**
 * Build usage tracking headers from Usage object
 * Returns headers with x-usage-* prefix for all non-zero usage types
 */
export function buildUsageHeaders(
    modelUsed: string,
    usage: Usage,
): Record<string, string> {
    const headers: Record<string, string> = {
        "x-model-used": modelUsed,
    };

    for (const [usageType, headerName] of Object.entries(USAGE_TYPE_HEADERS)) {
        const value = usage[usageType as UsageType];
        if (value && value > 0) {
            headers[headerName] = String(value);
        }
    }

    return headers;
}

/**
 * Parse usage headers back to Usage object
 */
export function parseUsageHeaders(
    headers: Headers | Record<string, string>,
): Usage {
    const usage: Usage = {};

    const getHeader = (name: string) =>
        headers instanceof Headers ? headers.get(name) : headers[name];

    const FLOAT_USAGE_TYPES: Set<string> = new Set([
        "promptAudioSeconds",
        "completionAudioSeconds",
        "completionVideoSeconds",
    ]);

    for (const [usageType, headerName] of Object.entries(USAGE_TYPE_HEADERS)) {
        const value = getHeader(headerName);
        if (value) {
            usage[usageType as UsageType] = FLOAT_USAGE_TYPES.has(usageType)
                ? parseFloat(value)
                : parseInt(value, 10);
        }
    }

    return usage;
}

/**
 * Helper for image services: create TokenUsage with only image tokens
 */
export function createImageTokenUsage(completionImageTokens: number): Usage {
    return {
        completionImageTokens,
    };
}

/**
 * Helper for video services: create TokenUsage with video seconds (Veo)
 */
export function createVideoSecondsUsage(completionVideoSeconds: number): Usage {
    return {
        completionVideoSeconds,
    };
}

/**
 * Helper for video services: create TokenUsage with video tokens (Seedance)
 */
export function createVideoTokenUsage(completionVideoTokens: number): Usage {
    return {
        completionVideoTokens,
    };
}

/**
 * Helper for audio/TTS services: create TokenUsage with audio tokens (characters)
 * ElevenLabs bills by character count, so we use completionAudioTokens
 */
export function createAudioTokenUsage(completionAudioTokens: number): Usage {
    return {
        completionAudioTokens,
    };
}

/**
 * Helper for audio transcription (Whisper): create Usage with audio seconds
 * Used for duration-based billing (e.g., OVH Whisper at $0.0000445/sec)
 */
export function createAudioSecondsUsage(promptAudioSeconds: number): Usage {
    return {
        promptAudioSeconds,
    };
}

/**
 * Helper for music generation: create Usage with completion audio seconds
 * Used for duration-based billing (e.g., ElevenLabs Music at $0.005/sec)
 */
export function createCompletionAudioSecondsUsage(
    completionAudioSeconds: number,
): Usage {
    return {
        completionAudioSeconds,
    };
}
