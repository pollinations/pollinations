export interface GenerationEvent {
    // Request identification and timing
    requestId: string;
    startTime: string; // DateTime as ISO string
    endTime: string; // DateTime as ISO string
    responseTime: number; // Float32
    responseStatus: string; // LowCardinality(String), default 'unknown'
    environment: string; // LowCardinality(String), default 'unknown'

    // User information
    userId: string; // LowCardinality(String), default 'unknown'
    userTier: string; // LowCardinality(String), default 'unknown'
    referrer: string; // LowCardinality(String), default 'unknown'

    // Model information
    provider: string; // LowCardinality(String), default 'unknown'
    modelRequested: string; // LowCardinality(String), default 'unknown'
    modelUsed: string; // LowCardinality(String), default 'unknown'
    modelResponseTime: string; // LowCardinality(String), default 'unknown'
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

    // Moderation results
    moderationHateSeverity: string; // LowCardinality(String), default 'unknown'
    moderationSelfHarmSeverity: string; // LowCardinality(String), default 'unknown'
    moderationSexualSeverity: string; // LowCardinality(String), default 'unknown'
    moderationViolenceSeverity: string; // LowCardinality(String), default 'unknown'
    moderationProtectedMaterialCodeDetected: boolean; // Bool
    moderationProtectedMaterialTextDetected: boolean; // Bool

    // Cache information
    cacheHit: boolean; // Bool
    cacheType: string; // LowCardinality(String), default 'unknown'
    cacheSemanticSimilarity: number | null; // Nullable(Float32)
    cacheSemanticThreshold: number | null; // Nullable(Float32)
    cacheKey: string;
}
