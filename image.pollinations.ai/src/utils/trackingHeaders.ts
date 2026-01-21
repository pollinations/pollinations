/**
 * Utility for building tracking headers for the enter service
 * Implements GitHub issue #4170 and #4638 requirements
 */

import debug from "debug";
import type { IMAGE_SERVICES } from "../../../shared/registry/image.ts";
import type { Usage } from "../../../shared/registry/registry.ts";
import {
    buildUsageHeaders,
    createImageUsage,
    createVideoSecondsUsage,
    createVideoTokensUsage,
} from "../../../shared/registry/usage-headers.ts";

const log = debug("pollinations:tracking-headers");

// Type constraint: model names must exist in registry
type ValidServiceName = keyof typeof IMAGE_SERVICES;

export interface TrackingUsageData {
    // Unified usage format for all image models
    completionImageTokens?: number;
    // Video models - Veo uses seconds, Seedance uses tokens
    completionVideoSeconds?: number;
    completionVideoTokens?: number;
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
    trackingData?: TrackingData,
): Record<string, string> {
    log(`=== TRACKING HEADERS FOR ${model} ===`);
    log(
        `Raw trackingData.usage:`,
        JSON.stringify(trackingData?.usage, null, 2),
    );

    const modelUsed = trackingData?.actualModel || model;

    // Determine usage type based on what's provided
    // Video models: Veo uses completionVideoSeconds, Seedance uses completionVideoTokens
    // Image models use completionImageTokens
    const videoTokens = trackingData?.usage?.completionVideoTokens;
    const videoSeconds = trackingData?.usage?.completionVideoSeconds;
    const imageTokens = trackingData?.usage?.completionImageTokens;

    let usage: Usage;
    if (videoTokens && videoTokens > 0) {
        // Seedance video model - use video tokens (from API response)
        log(`Using video tokens: ${videoTokens}`);
        usage = createVideoTokensUsage(videoTokens);
    } else if (videoSeconds && videoSeconds > 0) {
        // Veo video model - use video seconds
        log(`Using video seconds: ${videoSeconds}`);
        usage = createVideoSecondsUsage(videoSeconds);
    } else {
        // Image model - use image tokens (default to 1 for unit-based)
        const tokens = imageTokens || 1;
        log(`Using image tokens: ${tokens}`);
        usage = createImageUsage(tokens);
    }

    const headers = buildUsageHeaders(modelUsed, usage);

    log("Built tracking headers:", headers);
    log(`===================================`);
    return headers;
}

/**
 * Extract token count for billing purposes
 * @param usage - Usage data from the model
 * @returns Token count for billing
 */
export function extractTokenCount(usage?: TrackingUsageData): number {
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
        categories: moderation.categories?.join(","),
        severity: moderation.severity,
    };
}
