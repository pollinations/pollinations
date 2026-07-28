import type { CommunityEndpointRuntime } from "@shared/community-endpoints.ts";
import { describe, expect, it } from "vitest";
import { getEstimatedPrice } from "../../src/utils/model-stats.ts";

const makeStats = (avgCostUsd: number) => ({
    data: [{ model: "test-model", avg_cost_usd: avgCostUsd }],
});

describe("getEstimatedPrice", () => {
    it("returns 0 when model is undefined", () => {
        expect(getEstimatedPrice(makeStats(1.5), undefined)).toBe(0);
    });

    it("returns Tinybird avg_cost_usd when no community endpoint is provided", () => {
        expect(getEstimatedPrice(makeStats(33.34), "test-model")).toBe(33.34);
    });

    it("returns 0 when Tinybird has no data for the model", () => {
        expect(getEstimatedPrice(makeStats(0), "unknown-model")).toBe(0);
    });

    it("uses completionImagePrice for flat-rate community image models instead of Tinybird avg", () => {
        const endpoint: CommunityEndpointRuntime = {
            id: "test",
            ownerUserId: "owner",
            modelId: "vendouple/zimage",
            name: "zimage",
            title: null,
            description: null,
            modality: "image",
            imagePricing: "request",
            supportsImageEdits: false,
            baseUrl: "https://example.com",
            upstreamModel: "zimage",
            bearerTokenCiphertext: "encrypted",
            visibility: "public",
            disabledAt: null,
            disabledReason: null,
            completionImagePrice: 0.01,
            promptTextPrice: 0,
            promptCachedPrice: 0,
            promptCacheWritePrice: 0,
            promptAudioPrice: 0,
            promptImagePrice: 0,
            completionTextPrice: 0,
            completionReasoningPrice: 0,
            completionAudioPrice: 0,
        };
        const result = getEstimatedPrice(
            makeStats(33.34),
            "vendouple/zimage",
            endpoint,
        );
        expect(result).toBe(0.01);
    });

    it("falls back to Tinybird avg for community models without flat-rate pricing", () => {
        const endpoint: CommunityEndpointRuntime = {
            id: "test",
            ownerUserId: "owner",
            modelId: "test-model",
            name: "zimage",
            title: null,
            description: null,
            modality: "image",
            imagePricing: "tokens",
            supportsImageEdits: false,
            baseUrl: "https://example.com",
            upstreamModel: "zimage",
            bearerTokenCiphertext: "encrypted",
            visibility: "public",
            disabledAt: null,
            disabledReason: null,
            completionImagePrice: 0,
            promptTextPrice: 0,
            promptCachedPrice: 0,
            promptCacheWritePrice: 0,
            promptAudioPrice: 0,
            promptImagePrice: 0,
            completionTextPrice: 0,
            completionReasoningPrice: 0,
            completionAudioPrice: 0,
        };
        const result = getEstimatedPrice(
            makeStats(33.34),
            "test-model",
            endpoint,
        );
        expect(result).toBe(33.34);
    });
});
