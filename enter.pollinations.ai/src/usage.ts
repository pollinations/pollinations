import { z } from "zod";
import {
    ProviderId,
    REGISTRY,
    ServiceId,
    TokenUsage,
    UsageCost,
    UsagePrice,
} from "./registry";

const usageSchema = z.object({
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

type OpenAIUsage = z.infer<typeof usageSchema>;

const openAIResponseSchema = z.object({
    id: z.string().optional(),
    model: z.string().optional(),
    usage: usageSchema,
    created: z.number(),
});

function transformOpenAIUsage(usage: OpenAIUsage): TokenUsage {
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

export function calculateCostAndPrice(
    serviceId: ServiceId,
    response: unknown,
): [UsageCost, UsagePrice] {
    const parsedResponde = openAIResponseSchema.parse(response);
    const usage = transformOpenAIUsage(parsedResponde.usage);
    const usageCost = REGISTRY.calculateCost(
        parsedResponde.model as ProviderId,
        usage,
    );
    const usagePrice = REGISTRY.calculatePrice(serviceId, usage);
    return [usageCost, usagePrice];
}
