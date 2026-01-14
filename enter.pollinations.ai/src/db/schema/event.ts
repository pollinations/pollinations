import type { PriceDefinition, TokenUsage } from "@shared/registry/registry.ts";
import type { ContentFilterResult } from "@/schemas/openai";

export type EventType = "generate.text" | "generate.image";
export type ApiKeyType = "secret" | "publishable";

// Plain TypeScript type for Tinybird events (no D1 table - events sent directly to Tinybird)
export type TinybirdEvent = {
    id: string;

    // Request
    requestId: string;
    requestPath?: string;
    startTime: Date;
    endTime?: Date;
    responseTime?: number;
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

    // Meter
    selectedMeterId?: string;
    selectedMeterSlug?: string;
    balances?: Record<string, number>;

    // Referrer
    referrerUrl?: string;
    referrerDomain?: string;

    // Model
    modelRequested?: string | null;
    resolvedModelRequested?: string;
    modelUsed?: string;
    modelProviderUsed?: string;
    isBilledUsage: boolean;

    // Pricing
    tokenPricePromptText: number;
    tokenPricePromptCached: number;
    tokenPricePromptAudio: number;
    tokenPricePromptImage: number;
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
    tokenCountPromptImage: number;
    tokenCountCompletionText: number;
    tokenCountCompletionReasoning: number;
    tokenCountCompletionAudio: number;
    tokenCountCompletionImage: number;
    tokenCountCompletionVideoSeconds: number;
    tokenCountCompletionVideoTokens: number;

    // Totals
    totalCost: number;
    totalPrice: number;

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
    cacheType?: string;
    cacheSemanticSimilarity?: number;
    cacheSemanticThreshold?: number;
    cacheKey?: string;

    // Error
    errorResponseCode?: string;
    errorSource?: string;
    errorMessage?: string;
};

// Alias for backward compatibility with track.ts
export type InsertGenerationEvent = TinybirdEvent;

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
    tokenPriceCompletionVideoTokens: number;
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
    tokenCountCompletionVideoTokens: number;
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
        tokenPriceCompletionVideoTokens:
            priceDefinition?.completionVideoTokens || 0,
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
        tokenCountCompletionVideoTokens: usage?.completionVideoTokens || 0,
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
