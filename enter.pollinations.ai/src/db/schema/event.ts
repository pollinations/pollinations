import { PriceDefinition, TokenUsage } from "@/registry";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

const eventNameValues = ["generate.text", "generate.image"] as const;
type EventName = (typeof eventNameValues)[number];

const eventStatusValues = ["pending", "processing", "sent", "error"] as const;
type EventStatus = (typeof eventStatusValues)[number];

export const event = sqliteTable("event", {
    id: text("id").primaryKey(),

    // Request identification and timing
    requestId: text("request_id").notNull(),
    startTime: integer("start_time", { mode: "timestamp" }).notNull(),
    endTime: integer("end_time", { mode: "timestamp" }).notNull(),
    responseTime: real("response_time"),
    responseStatus: integer("response_status"),
    environment: text("environment"),

    // Event processing
    eventType: text("event_type").$type<EventName>().notNull(),
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
    userId: text("user_id").notNull(),
    userTier: text("user_tier"),
    referrerDomain: text("referrer_domain"),
    referrerUrl: text("referrer_url"),

    // Model information
    modelProvider: text("model_provider").notNull(),
    modelRequested: text("model_requested").notNull(),
    modelUsed: text("model_used").notNull(),
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

    // Cost and Price
    totalCost: real("total_cost").notNull(),
    totalPrice: real("total_price").notNull(),

    // Moderation results
    moderationHateSeverity: text("moderation_hate_severity"),
    moderationSelfHarmSeverity: text("moderation_self_harm_severity"),
    moderationSexualSeverity: text("moderation_sexual_severity"),
    moderationViolenceSeverity: text("moderation_violence_severity"),
    moderationProtectedMaterialCodeDetected: integer(
        "moderation_protected_material_code_detected",
        { mode: "boolean" },
    ),
    moderationProtectedMaterialTextDetected: integer(
        "moderation_protected_material_text_detected",
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
    priceDefinition: PriceDefinition,
): GenerationEventPriceParams {
    return {
        tokenPricePromptText: priceDefinition.promptTextTokens?.rate || 0,
        tokenPricePromptCached: priceDefinition.promptCachedTokens?.rate || 0,
        tokenPricePromptAudio: priceDefinition.promptAudioTokens?.rate || 0,
        tokenPricePromptImage: priceDefinition.promptImageTokens?.rate || 0,
        tokenPriceCompletionText:
            priceDefinition.completionTextTokens?.rate || 0,
        tokenPriceCompletionReasoning:
            priceDefinition.completionReasoningTokens?.rate || 0,
        tokenPriceCompletionAudio:
            priceDefinition.completionAudioTokens?.rate || 0,
        tokenPriceCompletionImage:
            priceDefinition.completionImageTokens?.rate || 0,
    };
}

export function usageToEventParams(
    usage: TokenUsage,
): GenerationEventUsageParams {
    return {
        tokenCountPromptText: usage.promptTextTokens || 0,
        tokenCountPromptCached: usage.promptCachedTokens || 0,
        tokenCountPromptAudio: usage.promptAudioTokens || 0,
        tokenCountPromptImage: usage.promptImageTokens || 0,
        tokenCountCompletionText: usage.completionTextTokens || 0,
        tokenCountCompletionReasoning: usage.completionReasoningTokens || 0,
        tokenCountCompletionAudio: usage.completionAudioTokens || 0,
        tokenCountCompletionImage: usage.completionImageTokens || 0,
    };
}
