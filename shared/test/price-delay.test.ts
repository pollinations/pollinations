import { describe, expect, it } from "vitest";
import {
    type CommunityEndpointPrices,
    type ProxyListingPayload,
    resolveEffectivePrices,
} from "../community-endpoints.ts";

const prices: CommunityEndpointPrices = {
    promptToken: 1000,
    completionToken: 1000,
    image: 0,
    audioInput: 0,
    audioOutput: 0,
    request: 100,
};

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
        prices,
        ...overrides,
    };
}

describe("resolveEffectivePrices", () => {
    it("returns current prices when no pending prices exist", () => {
        const payload = makePayload();
        const result = resolveEffectivePrices(payload);
        expect(result.prices).toEqual(prices);
        expect(result.pendingPrices).toBeUndefined();
    });

    it("returns current prices when pending not yet effective", () => {
        const futureTime = Date.now() + 12 * 60 * 60 * 1000;
        const newPrices = { ...prices, request: 200 };
        const payload = makePayload({
            pendingPrices: newPrices,
            pendingPricesEffectiveAt: futureTime,
        });
        const result = resolveEffectivePrices(payload);
        expect(result.prices).toEqual(prices);
        expect(result.pendingPrices).toEqual(newPrices);
        expect(result.pendingPricesEffectiveAt).toBe(futureTime);
    });

    it("applies pending prices when effective time has passed", () => {
        const pastTime = Date.now() - 1000;
        const newPrices = { ...prices, request: 200 };
        const payload = makePayload({
            pendingPrices: newPrices,
            pendingPricesEffectiveAt: pastTime,
        });
        const result = resolveEffectivePrices(payload);
        expect(result.prices).toEqual(newPrices);
        expect(result.pendingPrices).toBeUndefined();
    });

    it("applies pending at exact boundary", () => {
        const exactTime = Date.now();
        const newPrices = { ...prices, request: 500 };
        const payload = makePayload({
            pendingPrices: newPrices,
            pendingPricesEffectiveAt: exactTime,
        });
        const result = resolveEffectivePrices(payload, exactTime);
        expect(result.prices).toEqual(newPrices);
    });
});
