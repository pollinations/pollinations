export type GenerationEvent = {
    // Request identification and timing
    requestId: string;
    startTime: string; // DateTime as ISO string
    endTime: string; // DateTime as ISO string
    responseTime: number; // Float32
    responseStatus: string; // LowCardinality(String), default 'undefined'
    environment: string; // LowCardinality(String), default 'undefined'

    // User information
    userId: string; // LowCardinality(String), default 'undefined'
    userTier: string; // LowCardinality(String), default 'undefined'
    referrer: string; // LowCardinality(String), default 'undefined'

    // Model information
    provider: string; // LowCardinality(String), default 'undefined'
    modelRequested: string; // LowCardinality(String), default 'undefined'
    modelUsed: string; // LowCardinality(String), default 'undefined'
    modelResponseTime: string; // LowCardinality(String), default 'undefined'
    isBilledUsage: boolean; // Boolean

    // Token pricing
    tokenPricePromptText: number; // Float64
    tokenPricePromptCached: number; // Float64
    tokenPricePromptAudio: number; // Float64
    tokenPricePromptImage: number; // Float64
    tokenPriceCompletionText: number; // Float64
    tokenPriceCompletionAudio: number; // Float64
    tokenPriceCompletionImage: number; // Float64

    // Token usage counts
    tokenCountPromptText: number; // UInt32
    tokenCountPromptAudio: number; // UInt32
    tokenCountPromptCached: number; // UInt32
    tokenCountPromptImage: number; // UInt32
    tokenCountCompletionText: number; // UInt32
    tokenCountCompletionAudio: number; // UInt32
    tokenCountCompletionImage: number; // UInt32

    // Cost and Price
    calculatedTotalCost: number; // Float64
    calculatedTotalPrice: number; // Float64

    // Moderation results
    moderationHateSeverity: string; // LowCardinality(String), default 'undefined'
    moderationSelfHarmSeverity: string; // LowCardinality(String), default 'undefined'
    moderationSexualSeverity: string; // LowCardinality(String), default 'undefined'
    moderationViolenceSeverity: string; // LowCardinality(String), default 'undefined'
    moderationProtectedMaterialCodeDetected: boolean; // Bool
    moderationProtectedMaterialTextDetected: boolean; // Bool

    // Cache information
    cacheHit: boolean; // Bool
    cacheType: string; // LowCardinality(String), default 'undefined'
    cacheSemanticSimilarity: number | null; // Nullable(Float32)
    cacheSemanticThreshold: number | null; // Nullable(Float32)
    cacheKey: string;
};
