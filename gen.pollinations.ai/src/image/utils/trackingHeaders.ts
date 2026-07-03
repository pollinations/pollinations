/**
 * Utility for building tracking headers for the enter service
 */

import type { Usage } from "@shared/registry/registry.ts";
import { buildUsageHeaders } from "@shared/registry/usage-headers.ts";

export interface TrackingData {
    actualModel?: string;
    usage?: Usage & Record<string, unknown>; // Allow extra fields like totalTokenCount
}

/**
 * Build tracking headers for the enter service.
 * Passes usage directly to buildUsageHeaders - defaults to 1 image token if empty.
 */
export function buildTrackingHeaders(
    model: string,
    trackingData?: TrackingData,
): Record<string, string> {
    const modelUsed = trackingData?.actualModel || model;
    const usage: Usage = trackingData?.usage || { completionImageTokens: 1 };
    return buildUsageHeaders(modelUsed, usage);
}
