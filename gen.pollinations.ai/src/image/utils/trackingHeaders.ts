/**
 * Utility for building tracking headers for the enter service
 */

import type { Usage } from "@shared/registry/registry.ts";
import {
    buildUsageHeaders,
    PROVIDER_REPORTED_COST_HEADER,
} from "@shared/registry/usage-headers.ts";

export interface TrackingData {
    actualModel?: string;
    usage: Usage & Record<string, unknown>; // Allow extra fields like totalTokenCount
    providerReportedCost?: number;
}

/**
 * Build tracking headers for the enter service.
 * Passes provider-reported usage directly to buildUsageHeaders.
 */
export function buildTrackingHeaders(
    model: string,
    trackingData: TrackingData,
): Record<string, string> {
    if (!trackingData?.usage) {
        throw new Error(`Missing billable usage for ${model}`);
    }
    const modelUsed = trackingData?.actualModel || model;
    const headers = buildUsageHeaders(modelUsed, trackingData.usage);
    if (
        typeof trackingData.providerReportedCost === "number" &&
        Number.isFinite(trackingData.providerReportedCost) &&
        trackingData.providerReportedCost >= 0
    ) {
        headers[PROVIDER_REPORTED_COST_HEADER] = String(
            trackingData.providerReportedCost,
        );
    }
    if (!Object.keys(headers).some((header) => header.startsWith("x-usage-"))) {
        throw new Error(`Missing billable usage for ${model}`);
    }
    return headers;
}
