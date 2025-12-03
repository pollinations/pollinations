import { PriceDefinition, TokenUsage } from "@shared/registry/registry.ts";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { ContentFilterResult } from "@/schemas/openai";

const eventTypeValues = ["generate.text", "generate.image"] as const;
export type EventType = (typeof eventTypeValues)[number];

const eventStatusValues = ["pending", "processing", "sent", "error"] as const;
export type EventStatus = (typeof eventStatusValues)[number];

const apiKeyTypeValues = ["secret", "publishable"] as const;
export type ApiKeyType = (typeof apiKeyTypeValues)[number];

export const event = sqliteTable("event", {
    id: text("id").primaryKey(),

    // Event Processing (internal)
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

    // Request
    requestId: text("request_id").notNull(),
    requestPath: text("request_path"),
    startTime: integer("start_time", { mode: "timestamp_ms" }).notNull(),
    endTime: integer("end_time", { mode: "timestamp_ms" }).notNull(),
    responseTime: real("response_time"),
    responseStatus: integer("response_status"),
    environment: text("environment"),
    eventType: text("event_type").$type<EventType>().notNull(),

    // User
    userId: text("user_id"),
    userTier: text("user_tier"),
    userGithubId: text("user_github_id"),
    userGithubUsername: text("user_github_username"),

    // API Key
    apiKeyId: text("api_key_id"),
    apiKeyName: text("api_key_name"),
    apiKeyType: text("api_key_type", {
        enum: apiKeyTypeValues,
    }).$type<ApiKeyType>(),

    // Meter
    selectedMeterId: text("selected_meter_id"),
    selectedMeterSlug: text("selected_meter_slug"),
    balances: text("balances", { mode: "json" }).$type<
        Record<string, number>
    >(),

    // Referrer
    referrerUrl: text("referrer_url"),
    referrerDomain: text("referrer_domain"),

    // Model
    modelRequested: text("model_requested"),
    resolvedModelRequested: text("resolved_model_requested"),
    modelUsed: text("model_used"),
    modelProviderUsed: text("model_provider_used"),
    isBilledUsage: integer("is_billed_usage", { mode: "boolean" }).notNull(),

    // Pricing
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
    tokenPriceCompletionVideoSeconds: real(
        "token_price_completion_video_seconds",
    )
        .notNull()
        .default(0),

    // Usage
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
    tokenCountCompletionVideoSeconds: integer(
        "token_count_completion_video_seconds",
    )
        .notNull()
        .default(0),

    // Totals
    totalCost: real("total_cost").notNull(),
    totalPrice: real("total_price").notNull(),

    // Prompt Moderation
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

    // Completion Moderation
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

    // Cache
    cacheHit: integer("cache_hit", { mode: "boolean" }),
    cacheType: text("cache_type"),
    cacheSemanticSimilarity: real("cache_semantic_similarity"),
    cacheSemanticThreshold: real("cache_semantic_threshold"),
    cacheKey: text("cache_key"),

    // Error (stack/details removed to reduce D1 memory usage)
    errorResponseCode: text("error_response_code"),
    errorSource: text("error_source"),
    errorMessage: text("error_message"),
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
    tokenPriceCompletionVideoSeconds: number;
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
    tokenCountCompletionVideoSeconds: number;
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
        tokenPriceCompletionVideoSeconds:
            priceDefinition?.completionVideoSeconds || 0,
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
        tokenCountCompletionVideoSeconds: usage?.completionVideoSeconds || 0,
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

export function contentFilterResultsToEventParams({
    promptFilterResults,
    completionFilterResults,
}: {
    promptFilterResults: ContentFilterResult;
    completionFilterResults: ContentFilterResult;
}): GenerationEventContentFilterParams {
    // biome-ignore format: custom formatting
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
