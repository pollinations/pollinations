/**
 * Utility for building tracking headers for the enter service
 */

import type { IMAGE_SERVICES } from "@shared/registry/image.ts";
import type { Usage } from "@shared/registry/registry.ts";
import {
    buildUsageHeaders,
    FALLBACK_TARGET_HEADER,
    MODEL_PROVIDER_USED_HEADER,
} from "@shared/registry/usage-headers.ts";

type ValidServiceName = keyof typeof IMAGE_SERVICES;

export interface TrackingData {
    actualModel?: string;
    actualProvider?: string;
    fallbackUsed?: boolean;
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
    const headers = buildUsageHeaders(modelUsed, usage);
    if (trackingData?.actualProvider) {
        headers[MODEL_PROVIDER_USED_HEADER] = trackingData.actualProvider;
    }
    if (trackingData?.fallbackUsed) {
        headers[FALLBACK_TARGET_HEADER] = "config.targets[1]";
    }
    return headers;
}
