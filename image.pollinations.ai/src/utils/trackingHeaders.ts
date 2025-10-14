/**
 * Utility for building tracking headers for the enter service
 * Implements GitHub issue #4170 requirements
 */

import debug from "debug";
import type { IMAGE_SERVICES } from "../../../shared/registry/image.ts";

const log = debug("pollinations:tracking-headers");

// Type constraint: model names must exist in registry
type ValidServiceName = keyof typeof IMAGE_SERVICES;

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
    const headers: Record<string, string> = {};

    // Core tracking headers
    headers['x-model-used'] = trackingData?.actualModel || model;
    // Note: x-user-tier removed - enter service now gets tier from user table
    
    // Token counting logic - default to 1 for all models
    const completionTokens = 1;
    log(`Using default token count: ${completionTokens} for model: ${model}`);
    
    headers['x-completion-image-tokens'] = String(completionTokens);

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
    return 1; // Default for unit-based pricing (all current models)
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
