import {
    MIN_COMMUNITY_PRICE_PER_MILLION_TOKENS,
    MIN_COMMUNITY_PRICE_PER_TOKEN,
} from "@shared/community-endpoints.ts";
import { describe, expect, it } from "vitest";
import {
    isValidPriceInput,
    pricePerMillionToPerToken,
} from "../frontend/src/components/community-endpoints/types.ts";

describe("community endpoint price input", () => {
    it("accepts free and minimum prices", () => {
        expect(isValidPriceInput("")).toBe(true);
        expect(isValidPriceInput("0")).toBe(true);
        expect(
            isValidPriceInput(String(MIN_COMMUNITY_PRICE_PER_MILLION_TOKENS)),
        ).toBe(true);
        expect(
            pricePerMillionToPerToken(
                String(MIN_COMMUNITY_PRICE_PER_MILLION_TOKENS),
            ),
        ).toBe(MIN_COMMUNITY_PRICE_PER_TOKEN);
    });

    it("rejects positive prices below the minimum and malformed values", () => {
        expect(
            isValidPriceInput(
                String(MIN_COMMUNITY_PRICE_PER_MILLION_TOKENS / 10),
            ),
        ).toBe(false);
        expect(isValidPriceInput("-1")).toBe(false);
        expect(isValidPriceInput("0,1")).toBe(false);
        expect(isValidPriceInput("not-a-price")).toBe(false);
    });
});
