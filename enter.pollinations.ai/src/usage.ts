import { z } from "zod";
import { ProviderId, TokenUsage } from "./registry/registry";
import { EventType } from "./db/schema/event.ts";

const oaiUsageSchema = z.object({
    completion_tokens: z.number().int().nonnegative(),
    completion_tokens_details: z
        .object({
            accepted_prediction_tokens: z.number().int().nonnegative(),
            audio_tokens: z.number().int().nonnegative(),
            reasoning_tokens: z.number().int().nonnegative(),
            rejected_prediction_tokens: z.number().int().nonnegative(),
        })
        .optional(),
    prompt_tokens: z.number().int().nonnegative(),
    prompt_tokens_details: z
        .object({
            audio_tokens: z.number().int().nonnegative(),
            cached_tokens: z.number().int().nonnegative(),
        })
        .optional(),
    total_tokens: z.number().int().nonnegative(),
});

type OpenAIUsage = z.infer<typeof oaiUsageSchema>;

export const oaiResponseSchema = z.object({
    id: z.string().optional(),
    model: z.string().optional(),
    usage: oaiUsageSchema,
    created: z.number(),
});

export function transformOpenAIUsage(usage: OpenAIUsage): TokenUsage {
    const promptDetailTokens =
        (usage.prompt_tokens_details?.cached_tokens || 0) +
        (usage.prompt_tokens_details?.audio_tokens || 0);
    const completionDetailTokens =
        (usage.completion_tokens_details?.accepted_prediction_tokens || 0) +
        (usage.completion_tokens_details?.rejected_prediction_tokens || 0) +
        (usage.completion_tokens_details?.audio_tokens || 0) +
        (usage.completion_tokens_details?.reasoning_tokens || 0);
    return {
        unit: "TOKENS",
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
    model: ProviderId;
    usage: TokenUsage;
};
