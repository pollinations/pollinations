import { PriceDefinition, TokenUsage } from "@shared/registry/registry.ts";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { CreateChatCompletionResponse } from "@/schemas/openai";
import { removeUnset } from "@/util.ts";

const eventTypeValues = ["generate.text", "generate.image"] as const;
export type EventType = (typeof eventTypeValues)[number];

const eventStatusValues = ["pending", "processing", "sent", "error"] as const;
export type EventStatus = (typeof eventStatusValues)[number];

export const event = sqliteTable("event", {
    id: text("id").primaryKey(),

    // Request identification and timing
    requestId: text("request_id").notNull(),
    startTime: integer("start_time", { mode: "timestamp_ms" }).notNull(),
    endTime: integer("end_time", { mode: "timestamp_ms" }).notNull(),
    responseTime: real("response_time"),
    responseStatus: integer("response_status"),
    environment: text("environment"),

    // Event processing
    eventType: text("event_type").$type<EventType>().notNull(),
    eventProcessingId: text("event_processing_id"),
    eventStatus: text("event_status", { enum: eventStatusValues })
        .$type<EventStatus>()
        .default("pending")
        .notNull(),
    polarDeliveryAttempts: integer("polar_delivery_attempts")
        .default(0)
        .notNull(),
    polarDeliveredAt: integer("polar_delivered_at", {
        mode: "timestamp",
    }),
    tinybirdDeliveryAttempts: integer("tinybird_delivery_attempts")
        .default(0)
        .notNull(),
    tinybirdDeliveredAt: integer("tinybird_delivered_at", {
        mode: "timestamp",
    }),
    createdAt: integer("created_at", { mode: "timestamp" })
        .$defaultFn(() => new Date())
        .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
        .$onUpdateFn(() => new Date())
        .notNull(),

    // User information
    userId: text("user_id"),
    userTier: text("user_tier"),
    referrerDomain: text("referrer_domain"),
    referrerUrl: text("referrer_url"),

    // Model information
    modelRequested: text("model_requested"),
    modelUsed: text("model_used"),
    isBilledUsage: integer("is_billed_usage", { mode: "boolean" }).notNull(),

    // Token pricing
    tokenPricePromptText: real("token_price_prompt_text").notNull(),
    tokenPricePromptCached: real("token_price_prompt_cached").notNull(),
    tokenPricePromptAudio: real("token_price_prompt_audio").notNull(),
    tokenPricePromptImage: real("token_price_prompt_image").notNull(),
    tokenPriceCompletionText: real("token_price_completion_text").notNull(),
    tokenPriceCompletionReasoning: real(
        "token_price_completion_reasoning",
    ).notNull(),
    tokenPriceCompletionAudio: real("token_price_completion_audio").notNull(),
    tokenPriceCompletionImage: real("token_price_completion_image").notNull(),

    // Token usage
    tokenCountPromptText: integer("token_count_prompt_text").notNull(),
    tokenCountPromptAudio: integer("token_count_prompt_audio").notNull(),
    tokenCountPromptCached: integer("token_count_prompt_cached").notNull(),
    tokenCountPromptImage: integer("token_count_prompt_image").notNull(),
    tokenCountCompletionText: integer("token_count_completion_text").notNull(),
    tokenCountCompletionReasoning: integer(
        "token_count_completion_reasoning",
    ).notNull(),
    tokenCountCompletionAudio: integer(
        "token_count_completion_audio",
    ).notNull(),
    tokenCountCompletionImage: integer(
        "token_count_completion_image",
    ).notNull(),

    // Cost
    totalCost: real("total_cost").notNull(),

    // Price
    totalPrice: real("total_price").notNull(),

    // Prompt moderation results
    moderationPromptHateSeverity: text("moderation_prompt_hate_severity"),
    moderationPromptSelfHarmSeverity: text(
        "moderation_prompt_self_harm_severity",
    ),
    moderationPromptSexualSeverity: text("moderation_prompt_sexual_severity"),
    moderationPromptViolenceSeverity: text(
        "moderation_prompt_violence_severity",
    ),
    moderationPromptJailbreakDetected: integer(
        "moderation_prompt_jailbreak_detected",
        { mode: "boolean" },
    ),

    // Completion moderation results
    moderationCompletionHateSeverity: text(
        "moderation_completion_hate_severity",
    ),
    moderationCompletionSelfHarmSeverity: text(
        "moderation_completion_self_harm_severity",
    ),
    moderationCompletionSexualSeverity: text(
        "moderation_completion_sexual_severity",
    ),
    moderationCompletionViolenceSeverity: text(
        "moderation_completion_violence_severity",
    ),
    moderationCompletionProtectedMaterialCodeDetected: integer(
        "moderation_completion_protected_material_code_detected",
        { mode: "boolean" },
    ),
    moderationCompletionProtectedMaterialTextDetected: integer(
        "moderation_completion_protected_material_text_detected",
        { mode: "boolean" },
    ),

    // Cache information
    cacheHit: integer("cache_hit", { mode: "boolean" }),
    cacheType: text("cache_type"),
    cacheSemanticSimilarity: real("cache_semantic_similarity"),
    cacheSemanticThreshold: real("cache_semantic_threshold"),
    cacheKey: text("cache_key"),
});

export type InsertGenerationEvent = typeof event.$inferInsert;
export type SelectGenerationEvent = typeof event.$inferSelect;

export type GenerationEventPriceParams = {
    tokenPricePromptText: number;
    tokenPricePromptCached: number;
    tokenPricePromptAudio: number;
    tokenPricePromptImage: number;
    tokenPriceCompletionText: number;
    tokenPriceCompletionReasoning: number;
    tokenPriceCompletionAudio: number;
    tokenPriceCompletionImage: number;
};

export type GenerationEventUsageParams = {
    tokenCountPromptText: number;
    tokenCountPromptCached: number;
    tokenCountPromptAudio: number;
    tokenCountPromptImage: number;
    tokenCountCompletionText: number;
    tokenCountCompletionReasoning: number;
    tokenCountCompletionAudio: number;
    tokenCountCompletionImage: number;
};

export function priceToEventParams(
    priceDefinition?: PriceDefinition,
): GenerationEventPriceParams {
    // biome-ignore format: custom formatting
    // Rates are now just numbers (DPT), not objects with .rate property
    return {
        tokenPricePromptText: 
            priceDefinition?.promptTextTokens || 0,
        tokenPricePromptCached: 
            priceDefinition?.promptCachedTokens || 0,
        tokenPricePromptAudio: 
            priceDefinition?.promptAudioTokens || 0,
        tokenPricePromptImage: 
            priceDefinition?.promptImageTokens || 0,
        tokenPriceCompletionText:
            priceDefinition?.completionTextTokens || 0,
        tokenPriceCompletionReasoning:
            priceDefinition?.completionReasoningTokens || 0,
        tokenPriceCompletionAudio:
            priceDefinition?.completionAudioTokens || 0,
        tokenPriceCompletionImage:
            priceDefinition?.completionImageTokens || 0,
    };
}

export function usageToEventParams(
    usage?: TokenUsage,
): GenerationEventUsageParams {
    return {
        tokenCountPromptText: usage?.promptTextTokens || 0,
        tokenCountPromptCached: usage?.promptCachedTokens || 0,
        tokenCountPromptAudio: usage?.promptAudioTokens || 0,
        tokenCountPromptImage: usage?.promptImageTokens || 0,
        tokenCountCompletionText: usage?.completionTextTokens || 0,
        tokenCountCompletionReasoning: usage?.completionReasoningTokens || 0,
        tokenCountCompletionAudio: usage?.completionAudioTokens || 0,
        tokenCountCompletionImage: usage?.completionImageTokens || 0,
    };
}

export type GenerationEventContentFilterParams = {
    // prompt filter results
    moderationPromptHateSeverity?: string;
    moderationPromptSelfHarmSeverity?: string;
    moderationPromptSexualSeverity?: string;
    moderationPromptViolenceSeverity?: string;
    moderationPromptJailbreakDetected?: boolean;
    // completion filter results
    moderationCompletionHateSeverity?: string;
    moderationCompletionSelfHarmSeverity?: string;
    moderationCompletionSexualSeverity?: string;
    moderationCompletionViolenceSeverity?: string;
    moderationCompletionProtectedMaterialTextDetected?: boolean;
    moderationCompletionProtectedMaterialCodeDetected?: boolean;
};

// biome-ignore format: custom formatting
export function contentFilterResultsToEventParams(
    response: CreateChatCompletionResponse,
): GenerationEventContentFilterParams {
    const promptFilterResults =
        response.prompt_filter_results?.[0]?.content_filter_results;
    const completionFilterResults = 
        response.choices[0]?.content_filter_results;
    return {
        // prompt filter results
        moderationPromptHateSeverity: 
            promptFilterResults?.hate?.severity,
        moderationPromptSelfHarmSeverity:
            promptFilterResults?.self_harm?.severity,
        moderationPromptSexualSeverity: 
            promptFilterResults?.sexual?.severity,
        moderationPromptViolenceSeverity:
            promptFilterResults?.violence?.severity,
        moderationPromptJailbreakDetected:
            promptFilterResults?.jailbreak?.detected,
        // completion filter results
        moderationCompletionHateSeverity:
            completionFilterResults?.hate?.severity,
        moderationCompletionSelfHarmSeverity:
            completionFilterResults?.self_harm?.severity,
        moderationCompletionSexualSeverity:
            completionFilterResults?.sexual?.severity,
        moderationCompletionViolenceSeverity:
            completionFilterResults?.violence?.severity,
        moderationCompletionProtectedMaterialTextDetected:
            completionFilterResults?.protected_material_text?.detected,
        moderationCompletionProtectedMaterialCodeDetected:
            completionFilterResults?.protected_material_code?.detected,
    };
}
