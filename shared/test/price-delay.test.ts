import { describe, expect, it } from "vitest";
import {
    communityEndpointPrices,
    type CommunityEndpointPrices,
    type ProxyListingPayload,
    resolveEffectivePrices,
} from "../community-endpoints.ts";

const HOURS_12_MS = 12 * 60 * 60 * 1000;

function makePayload(
    overrides: Partial<ProxyListingPayload> = {},
): ProxyListingPayload {
    return {
        bearerTokenCiphertext: "encrypted",
        paidOnly: false,
        modality: "text",
        imagePricing: "request",
        inputModalities: ["text"],
        perUserRpm: null,
        fallbacks: [],
        prices: communityEndpointPrices({
            completionTextPrice: 0.1,
        }),
        ...overrides,
    };
}

describe("resolveEffectivePrices", () => {
    it("returns current prices when no pending prices exist", () => {
        const payload = makePayload();
        const result = resolveEffectivePrices(payload, Date.now());
        expect(result.prices.completionTextPrice).toBe(0.1);
        expect(result.pendingPrices).toBeUndefined();
        expect(result.pendingPricesEffectiveAt).toBeUndefined();
    });

    it("returns current prices when pending effective time has not passed", () => {
        const now = Date.now();
        const payload = makePayload({
            pendingPrices: communityEndpointPrices({
                completionTextPrice: 0.5,
            }),
            pendingPricesEffectiveAt: now + HOURS_12_MS,
        });
        const result = resolveEffectivePrices(payload, now);
        expect(result.prices.completionTextPrice).toBe(0.1);
        expect(result.pendingPrices?.completionTextPrice).toBe(0.5);
        expect(result.pendingPricesEffectiveAt).toBe(now + HOURS_12_MS);
    });

    it("applies pending prices when effective time has passed", () => {
        const now = Date.now();
        const payload = makePayload({
            pendingPrices: communityEndpointPrices({
                completionTextPrice: 0.5,
            }),
            pendingPricesEffectiveAt: now - 1000,
        });
        const result = resolveEffectivePrices(payload, now);
        expect(result.prices.completionTextPrice).toBe(0.5);
        expect(result.pendingPrices).toBeUndefined();
        expect(result.pendingPricesEffectiveAt).toBeUndefined();
    });

    it("returns current prices when effective time is exactly now", () => {
        const now = Date.now();
        const payload = makePayload({
            pendingPrices: communityEndpointPrices({
                completionTextPrice: 0.5,
            }),
            pendingPricesEffectiveAt: now,
        });
        const result = resolveEffectivePrices(payload, now);
        // At exactly the boundary, the pending price takes effect
        expect(result.prices.completionTextPrice).toBe(0.5);
        expect(result.pendingPrices).toBeUndefined();
    });
});
