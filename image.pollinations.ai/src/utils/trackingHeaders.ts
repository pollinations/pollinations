/**
 * Utility for building tracking headers for the enter service
 */

import type { IMAGE_SERVICES } from "../../../shared/registry/image.ts";
import type { Usage } from "../../../shared/registry/registry.ts";
import { buildUsageHeaders } from "../../../shared/registry/usage-headers.ts";

type ValidServiceName = keyof typeof IMAGE_SERVICES;

export interface TrackingData {
    actualModel?: string;
    usage?: Usage & Record<string, unknown>; // Allow extra fields like totalTokenCount
}

/**
 * Build tracking headers for the enter service.
 * Passes usage directly to buildUsageHeaders - defaults to 1 image token if empty.
 */
export function buildTrackingHeaders(
    model: ValidServiceName,
    trackingData?: TrackingData,
): Record<string, string> {
    const modelUsed = trackingData?.actualModel || model;
    const usage: Usage = trackingData?.usage || { completionImageTokens: 1 };
    return buildUsageHeaders(modelUsed, usage);
}
