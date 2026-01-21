import type { Usage, UsageType } from "./registry.js";

/**
 * Mapping from Usage field names to HTTP header names
 */
export const USAGE_TYPE_HEADERS: Record<UsageType, string> = {
    promptTextTokens: "x-usage-prompt-text-tokens",
    promptCachedTokens: "x-usage-prompt-cached-tokens",
    promptAudioTokens: "x-usage-prompt-audio-tokens",
    promptImageTokens: "x-usage-prompt-image-tokens",
    completionTextTokens: "x-usage-completion-text-tokens",
    completionReasoningTokens: "x-usage-completion-reasoning-tokens",
    completionAudioTokens: "x-usage-completion-audio-tokens",
    completionImageTokens: "x-usage-completion-image-tokens",
    completionVideoSeconds: "x-usage-completion-video-seconds",
    completionVideoTokens: "x-usage-completion-video-tokens",
};

/**
 * Convert OpenAI usage format to Usage format
 */
export function openaiUsageToUsage(openaiUsage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_tokens_details?: {
        cached_tokens?: number;
        audio_tokens?: number;
    } | null;
    completion_tokens_details?: {
        reasoning_tokens?: number;
        audio_tokens?: number;
        accepted_prediction_tokens?: number;
        rejected_prediction_tokens?: number;
    } | null;
}): Usage {
    const promptDetailTokens =
        (openaiUsage.prompt_tokens_details?.cached_tokens || 0) +
        (openaiUsage.prompt_tokens_details?.audio_tokens || 0);

    const completionDetailTokens =
        (openaiUsage.completion_tokens_details?.accepted_prediction_tokens ||
            0) +
        (openaiUsage.completion_tokens_details?.rejected_prediction_tokens ||
            0) +
        (openaiUsage.completion_tokens_details?.audio_tokens || 0) +
        (openaiUsage.completion_tokens_details?.reasoning_tokens || 0);

    // biome-ignore format: custom formatting
    return {
        promptTextTokens: 
            openaiUsage.prompt_tokens - promptDetailTokens,
        promptCachedTokens:
            openaiUsage.prompt_tokens_details?.cached_tokens || 0,
        promptAudioTokens: 
            openaiUsage.prompt_tokens_details?.audio_tokens || 0,
        completionTextTokens:
            openaiUsage.completion_tokens - completionDetailTokens,
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

    let totalTokens = 0;

    // Iterate over all usage types
    for (const [usageType, headerName] of Object.entries(USAGE_TYPE_HEADERS)) {
        const value = usage[usageType as UsageType];
        if (value && value > 0) {
            headers[headerName] = String(value);
            totalTokens += value;
        }
    }

    if (totalTokens > 0) {
        headers["x-usage-total-tokens"] = String(totalTokens);
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

    // Iterate in reverse to parse headers back to usage
    for (const [usageType, headerName] of Object.entries(USAGE_TYPE_HEADERS)) {
        const value = getHeader(headerName);
        if (value) {
            usage[usageType as UsageType] = parseInt(value, 10);
        }
    }

    return usage;
}

/**
 * Helper for image services: create Usage with only image tokens
 */
export function createImageUsage(completionImageTokens: number): Usage {
    return { completionImageTokens };
}

/**
 * Helper for video services: create Usage with video seconds (Veo)
 */
export function createVideoSecondsUsage(completionVideoSeconds: number): Usage {
    return { completionVideoSeconds };
}

/**
 * Helper for video services: create Usage with video tokens (Seedance)
 */
export function createVideoTokensUsage(completionVideoTokens: number): Usage {
    return { completionVideoTokens };
}
