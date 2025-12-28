/**
 * Utility for building tracking headers for the enter service
 * Implements GitHub issue #4170 and #4638 requirements
 */

import debug from "debug";
import type { IMAGE_SERVICES } from "../../../shared/registry/image.ts";
import { buildUsageHeaders, createImageTokenUsage } from "../../../shared/registry/usage-headers.js";

const log = debug("pollinations:tracking-headers");

// Type constraint: model names must exist in registry
type ValidServiceName = keyof typeof IMAGE_SERVICES;

export interface TrackingUsageData {
    // Unified usage format for all image models
    completionImageTokens?: number;
    promptTokenCount?: number;
    totalTokenCount?: number;
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
    // Determine token count (works for both unit-based and token-based pricing)
    // Unit-based models return 1, token-based models return actual count
    const completionTokens = trackingData?.usage?.completionImageTokens || 1;
    log(`=== TRACKING HEADERS FOR ${model} ===`);
    log(`Raw trackingData.usage:`, JSON.stringify(trackingData?.usage, null, 2));
    log(`Extracted completionImageTokens: ${completionTokens}`);
    log(`===================================`);
    
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
    return usage?.completionImageTokens || 1;
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
