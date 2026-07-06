import type { ApiKeyType } from "../auth/api-key-creation.ts";
import type { PriceDefinition, Usage } from "../registry/registry.ts";
import type { ContentFilterResult } from "./openai.ts";

export type EventType =
    | "generate.text"
    | "generate.image"
    | "generate.audio"
    | "generate.embedding"
    | "generate.realtime";

// Plain TypeScript type for Tinybird events (no D1 table - events sent directly to Tinybird)
export type TinybirdEvent = {
    id: string;

    // Request
    requestId: string;
    requestPath?: string;
    startTime: Date;
    endTime?: Date;
    responseTime?: number;
    /**
     * Pure generation time in ms (first stream chunk to last stream chunk),
     * for streamed text responses only. `endTime`/`responseTime` resolve as
     * soon as the upstream response headers arrive — before the stream body
     * is read — so they approximate time-to-first-byte for streaming
     * requests, not total generation time. This field fills that gap.
     * Undefined for non-streamed responses, where `responseTime` already
     * reflects the full buffered duration.
     */
    streamDurationMs?: number;
    responseStatus?: number;
    environment?: string;
    eventType: EventType;

    // User
    userId?: string;
    userTier?: string;
    userGithubId?: string;
    userGithubUsername?: string;

    // API Key
    apiKeyId?: string;
    apiKeyName?: string;
    apiKeyType?: ApiKeyType;
    apiKeyCreatedVia?: string;
    apiKeyCreatedForApp?: string;
    apiKeyCreatedForUserId?: string;
    apiKeyClientId?: string;

    // Meter
    selectedMeterId?: string;
    selectedMeterSlug?: string;
    balances?: Record<string, number>;

    // Billing adjustments (search/tool fees). Keyed by versioned rule id
    // (e.g. "google.gemini_3.search_query.v1"). Left undefined when the request
    // had no adjustments so ClickHouse's DEFAULT map() fills them; a literal {}
    // would serialize on every event since removeUnset only strips null/undefined.
    adjustmentCosts?: Record<string, number>; // rule id → USD cost
    adjustmentUnits?: Record<string, number>; // rule id → units charged (fractional-capable)

    // Network
    ipSubnet?: string;
    ipHash?: string;

    // Referrer
    referrerUrl?: string;
    referrerDomain?: string;

    // Model
    modelRequested?: string | null;
    resolvedModelRequested?: string;
    modelUsed?: string;
    modelProviderUsed?: string;
    /** True when Portkey served from a non-primary fallback target. */
    fallbackUsed?: boolean;
    isBilledUsage: boolean;

    // Pricing
    tokenPricePromptText: number;
    tokenPricePromptCached: number;
    tokenPricePromptCacheWrite: number;
    tokenPricePromptAudio: number;
    tokenPricePromptImage: number;
    tokenPricePromptVideo: number;
    tokenPriceCompletionText: number;
    tokenPriceCompletionReasoning: number;
    tokenPriceCompletionAudio: number;
    tokenPriceCompletionImage: number;
    tokenPriceCompletionVideoSeconds: number;
    tokenPriceCompletionVideoTokens: number;

    // Usage
    tokenCountPromptText: number;
    tokenCountPromptAudio: number;
    tokenCountPromptCached: number;
    tokenCountPromptCacheWrite: number;
    tokenCountPromptImage: number;
    tokenCountPromptVideo: number;
    tokenCountCompletionText: number;
    tokenCountCompletionReasoning: number;
    tokenCountCompletionAudio: number;
    tokenCountCompletionImage: number;
    tokenCountCompletionVideoSeconds: number;
    tokenCountCompletionVideoTokens: number;
    tokenCountPromptAudioSeconds: number;
    tokenCountCompletionAudioSeconds: number;

    // Totals
    totalCost: number;
    totalPrice: number;
    devPrice?: number;
    markupRate?: number;
    communityModelRewardUserId?: string;
    communityModelRewardRate?: number;
    communityModelRewardAmount?: number;

    // Prompt Moderation
    moderationPromptHateSeverity?: string;
    moderationPromptSelfHarmSeverity?: string;
    moderationPromptSexualSeverity?: string;
    moderationPromptViolenceSeverity?: string;
    moderationPromptJailbreakDetected?: boolean;

    // Completion Moderation
    moderationCompletionHateSeverity?: string;
    moderationCompletionSelfHarmSeverity?: string;
    moderationCompletionSexualSeverity?: string;
    moderationCompletionViolenceSeverity?: string;
    moderationCompletionProtectedMaterialCodeDetected?: boolean;
    moderationCompletionProtectedMaterialTextDetected?: boolean;

    // Cache
    cacheHit?: boolean;
    cacheKey?: string;

    // Error
    errorResponseCode?: string;
    errorSource?: string;
    errorMessage?: string;
};

export type GenerationEventPriceParams = {
    tokenPricePromptText: number;
    tokenPricePromptCached: number;
    tokenPricePromptCacheWrite: number;
    tokenPricePromptAudio: number;
    tokenPricePromptImage: number;
    tokenPricePromptVideo: number;
    tokenPriceCompletionText: number;
    tokenPriceCompletionReasoning: number;
    tokenPriceCompletionAudio: number;
    tokenPriceCompletionImage: number;
    tokenPriceCompletionVideoSeconds: number;
    tokenPriceCompletionVideoTokens: number;
};

export type GenerationEventUsageParams = {
    tokenCountPromptText: number;
    tokenCountPromptCached: number;
    tokenCountPromptCacheWrite: number;
    tokenCountPromptAudio: number;
    tokenCountPromptImage: number;
    tokenCountPromptVideo: number;
    tokenCountCompletionText: number;
    tokenCountCompletionReasoning: number;
    tokenCountCompletionAudio: number;
    tokenCountCompletionImage: number;
    tokenCountCompletionVideoSeconds: number;
    tokenCountCompletionVideoTokens: number;
    tokenCountPromptAudioSeconds: number;
    tokenCountCompletionAudioSeconds: number;
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
        tokenPricePromptCacheWrite:
            priceDefinition?.promptCacheWriteTokens || 0,
        tokenPricePromptAudio: 
            priceDefinition?.promptAudioTokens || 0,
        tokenPricePromptImage:
            priceDefinition?.promptImageTokens || 0,
        tokenPricePromptVideo:
            priceDefinition?.promptVideoTokens || 0,
        tokenPriceCompletionText:
            priceDefinition?.completionTextTokens || 0,
        tokenPriceCompletionReasoning:
            priceDefinition?.completionReasoningTokens ??
            priceDefinition?.completionTextTokens ??
            0,
        tokenPriceCompletionAudio:
            priceDefinition?.completionAudioTokens || 0,
        tokenPriceCompletionImage:
            priceDefinition?.completionImageTokens || 0,
        tokenPriceCompletionVideoSeconds:
            priceDefinition?.completionVideoSeconds || 0,
        tokenPriceCompletionVideoTokens:
            priceDefinition?.completionVideoTokens || 0,
    };
}

export function usageToEventParams(usage?: Usage): GenerationEventUsageParams {
    return {
        tokenCountPromptText: usage?.promptTextTokens || 0,
        tokenCountPromptCached: usage?.promptCachedTokens || 0,
        tokenCountPromptCacheWrite: usage?.promptCacheWriteTokens || 0,
        tokenCountPromptAudio: usage?.promptAudioTokens || 0,
        tokenCountPromptImage: usage?.promptImageTokens || 0,
        tokenCountPromptVideo: usage?.promptVideoTokens || 0,
        tokenCountCompletionText: usage?.completionTextTokens || 0,
        tokenCountCompletionReasoning: usage?.completionReasoningTokens || 0,
        tokenCountCompletionAudio: usage?.completionAudioTokens || 0,
        tokenCountCompletionImage: usage?.completionImageTokens || 0,
        tokenCountCompletionVideoSeconds: usage?.completionVideoSeconds || 0,
        tokenCountCompletionVideoTokens: usage?.completionVideoTokens || 0,
        tokenCountPromptAudioSeconds: usage?.promptAudioSeconds || 0,
        tokenCountCompletionAudioSeconds: usage?.completionAudioSeconds || 0,
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
