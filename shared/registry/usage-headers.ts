import type { Usage, UsageType } from "./registry.ts";

/**
 * Mapping from Usage field names to HTTP header names
 */
export const USAGE_TYPE_HEADERS: Record<UsageType, string> = {
    promptTextTokens: "x-usage-prompt-text-tokens",
    promptCachedTokens: "x-usage-prompt-cached-tokens",
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
 * Some providers violate this: Grok-reasoning (Azure), Mistral/DeepSeek
 * reasoning models (OpenRouter), and certain Gemini responses report
 * subcategories as additive counters separate from the grand total.
 *
 * We detect the convention per-row by comparing the grand total against
 * the sum of details. If the subcategories exceed the grand total, the
 * provider is using the additive convention and we treat `*_tokens` as
 * the visible-text count directly.
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
    completion_tokens_details?: {
        reasoning_tokens?: number | null;
        audio_tokens?: number | null;
        accepted_prediction_tokens?: number | null;
        rejected_prediction_tokens?: number | null;
    } | null;
}): Usage {
    const promptDetailTokens =
        (openaiUsage.prompt_tokens_details?.cached_tokens || 0) +
        (openaiUsage.prompt_tokens_details?.audio_tokens || 0) +
        (openaiUsage.prompt_tokens_details?.image_tokens || 0);

    const completionDetailTokens =
        (openaiUsage.completion_tokens_details?.accepted_prediction_tokens ||
            0) +
        (openaiUsage.completion_tokens_details?.rejected_prediction_tokens ||
            0) +
        (openaiUsage.completion_tokens_details?.audio_tokens || 0) +
        (openaiUsage.completion_tokens_details?.reasoning_tokens || 0);

    const promptTextTokens =
        openaiUsage.prompt_tokens >= promptDetailTokens
            ? openaiUsage.prompt_tokens - promptDetailTokens
            : openaiUsage.prompt_tokens;

    const completionTextTokens =
        openaiUsage.completion_tokens >= completionDetailTokens
            ? openaiUsage.completion_tokens - completionDetailTokens
            : openaiUsage.completion_tokens;

    return {
        promptTextTokens,
        promptCachedTokens:
            openaiUsage.prompt_tokens_details?.cached_tokens || 0,
        promptAudioTokens: openaiUsage.prompt_tokens_details?.audio_tokens || 0,
        promptImageTokens: openaiUsage.prompt_tokens_details?.image_tokens || 0,
        completionTextTokens,
        completionAudioTokens:
            openaiUsage.completion_tokens_details?.audio_tokens || 0,
        completionReasoningTokens:
            openaiUsage.completion_tokens_details?.reasoning_tokens || 0,
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
