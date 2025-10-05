import { z } from "zod";
import { ProviderId, TokenUsage } from "./registry/registry";

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

const contentFilterResultSchema = z
    .object({
        hate: z.object({
            filtered: z.boolean(),
            severity: z.enum(["safe", "low", "medium", "high"]),
        }),
        self_harm: z.object({
            filtered: z.boolean(),
            severity: z.enum(["safe", "low", "medium", "high"]),
        }),
        sexual: z.object({
            filtered: z.boolean(),
            severity: z.enum(["safe", "low", "medium", "high"]),
        }),
        violence: z.object({
            filtered: z.boolean(),
            severity: z.enum(["safe", "low", "medium", "high"]),
        }),
        jailbreak: z.object({
            filtered: z.boolean(),
            detected: z.boolean(),
        }),
        protected_material_text: z.object({
            filtered: z.boolean(),
            detected: z.boolean(),
        }),
        protected_material_code: z.object({
            filtered: z.boolean(),
            detected: z.boolean(),
        }),
    })
    .partial();

export type ContentFilterResult = z.infer<typeof contentFilterResultSchema>;

const userTierSchema = z.literal(["anonymous", "seed", "flower", "nectar"]);
export type UserTier = z.infer<typeof userTierSchema>;

const choiceSchema = z.object({
    index: z.number().int(),
    content_filter_results: contentFilterResultSchema,
    message: z
        .object({
            role: z.string(),
            content: z.string(),
            // WARNING: Update this to match the actual openai schema
        })
        .optional()
        .catch(undefined),
    // omitting other fields as they are not needed yet
    // (message, logprobs, finish_reason)
});

export const openaiResponseSchema = z.object({
    id: z.string().optional(),
    model: z.string().optional(),
    usage: usageSchema,
    created: z.number(),
    choices: z.array(choiceSchema),
    prompt_filter_results: z.array(
        z.object({
            prompt_index: z.number(),
            content_filter_results: contentFilterResultSchema,
        }),
    ),
    user_tier: userTierSchema.optional(),
});

export type OpenAIResponse = z.infer<typeof openaiResponseSchema>;

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
