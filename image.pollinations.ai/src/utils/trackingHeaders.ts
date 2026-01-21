/**
 * Utility for building tracking headers for the enter service
 * Implements GitHub issue #4170 and #4638 requirements
 */

import debug from "debug";
import type { IMAGE_SERVICES } from "../../../shared/registry/image.ts";
import type { Usage } from "../../../shared/registry/registry.ts";
import { buildUsageHeaders } from "../../../shared/registry/usage-headers.ts";

const log = debug("pollinations:tracking-headers");

// Type constraint: model names must exist in registry
type ValidServiceName = keyof typeof IMAGE_SERVICES;

export interface TrackingUsageData {
    // Unified usage format for all image models
    completionImageTokens?: number;
    // Video models - Veo/Wan uses seconds, Seedance uses tokens
    completionVideoSeconds?: number;
    completionVideoTokens?: number;
    // Audio seconds for video models with audio (Wan)
    completionAudioSeconds?: number;
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
 * Simply passes through usage data - each field is handled independently.
 */
export function buildTrackingHeaders(
    model: ValidServiceName,
    trackingData?: TrackingData,
): Record<string, string> {
    const modelUsed = trackingData?.actualModel || model;

    // Build usage object from whatever fields are provided
    // Each field is independent - no conditionals needed
    const usage: Usage = {
        completionImageTokens: trackingData?.usage?.completionImageTokens,
        completionVideoSeconds: trackingData?.usage?.completionVideoSeconds,
        completionVideoTokens: trackingData?.usage?.completionVideoTokens,
        completionAudioSeconds: trackingData?.usage?.completionAudioSeconds,
    };

    // Default to 1 image token if nothing provided (for unit-based billing)
    if (
        !usage.completionImageTokens &&
        !usage.completionVideoSeconds &&
        !usage.completionVideoTokens &&
        !usage.completionAudioSeconds
    ) {
        usage.completionImageTokens = 1;
    }

    log(`Tracking: model=${modelUsed}, usage=${JSON.stringify(usage)}`);
    return buildUsageHeaders(modelUsed, usage);
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
