/**
 * Utility for building tracking headers for the enter service
 * Implements GitHub issue #4170 and #4638 requirements
 */

import debug from "debug";
import { IMAGE_SERVICES, IMAGE_COSTS } from "../../../shared/registry/image.ts";
import { buildUsageHeaders, createImageTokenUsage } from "../../../shared/registry/usage-headers.js";

const log = debug("pollinations:tracking-headers");

// Type constraint: model names must exist in registry
type ValidServiceName = keyof typeof IMAGE_SERVICES;

/**
 * Check if a model uses per-token pricing (vs per-image)
 */
function isPerTokenPricing(model: ValidServiceName): boolean {
    const serviceConfig = IMAGE_SERVICES[model];
    const modelId = serviceConfig?.modelId as string;
    const costHistory = IMAGE_COSTS[modelId as keyof typeof IMAGE_COSTS];
    const latestCost = costHistory?.[0] as any;
    return latestCost?.perToken === true;
}

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
 * @param model - The requested model name (must be a valid service from registry)
 * @param trackingData - Usage and moderation data from generation
 * @returns Headers object for HTTP response
 */
export function buildTrackingHeaders(
    model: ValidServiceName,
    trackingData?: TrackingData
): Record<string, string> {
    // Determine token count
    let completionTokens = 1; // Default for unit-based pricing models
    
    if (isPerTokenPricing(model) && trackingData?.usage?.candidatesTokenCount) {
        // For token-based models (defined in cost registry), use actual token count from API
        completionTokens = trackingData.usage.candidatesTokenCount;
        log(`${model} token count: ${completionTokens} (from candidatesTokenCount)`);
    } else {
        log(`Using default token count: ${completionTokens} for model: ${model}`);
    }
    
    // Use shared utility to build headers
    const modelUsed = trackingData?.actualModel || model;
    const usage = createImageTokenUsage(completionTokens);
    const headers = buildUsageHeaders(modelUsed, usage);

    log('Built tracking headers:', Object.keys(headers));
    return headers;
}

/**
 * Extract token count for billing purposes
 * @param model - The model name (must be a valid service from registry)
 * @param usage - Usage data from the model
 * @returns Token count for billing
 */
export function extractTokenCount(model: ValidServiceName, usage?: TrackingUsageData): number {
    if (isPerTokenPricing(model) && usage?.candidatesTokenCount) {
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
