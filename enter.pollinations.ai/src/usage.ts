import type { ModelId, Usage } from "@shared/registry/registry.ts";
import type { CompletionUsage } from "@/schemas/openai.ts";

export function transformOpenAIUsage(usage: CompletionUsage): Usage {
    const promptDetailTokens =
        (usage.prompt_tokens_details?.cached_tokens || 0) +
        (usage.prompt_tokens_details?.audio_tokens || 0);
    const completionDetailTokens =
        (usage.completion_tokens_details?.accepted_prediction_tokens || 0) +
        (usage.completion_tokens_details?.rejected_prediction_tokens || 0) +
        (usage.completion_tokens_details?.audio_tokens || 0) +
        (usage.completion_tokens_details?.reasoning_tokens || 0);
    return {
        promptTextTokens: usage.prompt_tokens - promptDetailTokens,
        promptCachedTokens: usage.prompt_tokens_details?.cached_tokens || 0,
        promptAudioTokens: usage.prompt_tokens_details?.audio_tokens || 0,
        completionTextTokens: usage.completion_tokens - completionDetailTokens,
        completionAudioTokens:
            usage.completion_tokens_details?.audio_tokens || 0,
        completionReasoningTokens:
            usage.completion_tokens_details?.reasoning_tokens || 0,
    };
}

export type ModelUsage = {
    model: ModelId;
    usage: Usage;
};
