/**
 * Utility for building tracking headers for the enter service
 * Implements GitHub issue #4170 requirements
 */

import debug from "debug";

const log = debug("pollinations:tracking-headers");

export interface TrackingUsageData {
    // Vertex AI / Gemini usage format
    candidatesTokenCount?: number;
    promptTokenCount?: number;
    totalTokenCount?: number;
    candidatesTokensDetails?: Array<{
        modality: string;
        tokenCount: number;
    }>;
}

export interface ContentSafetyFlags {
    categories?: string[];
    severity?: string;
    blocked?: boolean;
}

export interface TrackingData {
    actualModel?: string;
    usage?: TrackingUsageData;
    promptModeration?: ContentSafetyFlags;
    imageModeration?: ContentSafetyFlags;
}

/**
 * Build tracking headers for the enter service
 * @param model - The requested model name
 * @param userTier - The user's authentication tier
 * @param trackingData - Usage and moderation data from generation
 * @returns Headers object for HTTP response
 */
export function buildTrackingHeaders(
    model: string,
    userTier: string,
    trackingData?: TrackingData
): Record<string, string> {
    const headers: Record<string, string> = {};

    // Core tracking headers
    headers['x-model-used'] = trackingData?.actualModel || model;
    headers['x-user-tier'] = userTier || 'anonymous';
    
    // Token counting logic
    let completionTokens = 1; // Default for unit-based pricing models
    
    if (model === 'nanobanana' && trackingData?.usage?.candidatesTokenCount) {
        // For nanobanana, use total candidates tokens (image + text)
        completionTokens = trackingData.usage.candidatesTokenCount;
        log(`Nanobanana token count: ${completionTokens} (from candidatesTokenCount)`);
    } else {
        log(`Using default token count: ${completionTokens} for model: ${model}`);
    }
    
    headers['x-completion-image-tokens'] = String(completionTokens);

    log('Built tracking headers:', Object.keys(headers));
    return headers;
}

/**
 * Extract token count for billing purposes
 * @param model - The model name
 * @param usage - Usage data from the model
 * @returns Token count for billing
 */
export function extractTokenCount(model: string, usage?: TrackingUsageData): number {
    if (model === 'nanobanana' && usage?.candidatesTokenCount) {
        return usage.candidatesTokenCount;
    }
    return 1; // Default for unit-based pricing
}

/**
 * Format moderation data for OpenAI-compatible headers
 * @param moderation - Content safety flags
 * @returns Formatted moderation data
 */
export function formatModerationData(moderation?: ContentSafetyFlags): {
    categories?: string;
    severity?: string;
} {
    if (!moderation) return {};
    
    return {
        categories: moderation.categories?.join(','),
        severity: moderation.severity
    };
}
