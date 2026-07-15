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
    fallbackTarget?: string;
    usage: Usage & Record<string, unknown>; // Allow extra fields like totalTokenCount
}

/**
 * Build tracking headers for the enter service.
 * Passes provider-reported usage directly to buildUsageHeaders.
 */
export function buildTrackingHeaders(
    model: ValidServiceName,
    trackingData: TrackingData,
): Record<string, string> {
    if (!trackingData?.usage) {
        throw new Error(`Missing billable usage for ${model}`);
    }
    const modelUsed = trackingData?.actualModel || model;
    const headers = buildUsageHeaders(modelUsed, trackingData.usage);
    if (!Object.keys(headers).some((header) => header.startsWith("x-usage-"))) {
        throw new Error(`Missing billable usage for ${model}`);
    }
    if (trackingData.actualProvider) {
        headers[MODEL_PROVIDER_USED_HEADER] = trackingData.actualProvider;
    }
    if (trackingData.fallbackTarget) {
        headers[FALLBACK_TARGET_HEADER] = trackingData.fallbackTarget;
    }
    return headers;
}
