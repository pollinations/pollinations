import {
    MAX_COMMUNITY_PRICE_PER_IMAGE,
    MAX_COMMUNITY_PRICE_PER_MILLION_TOKENS,
    MAX_COMMUNITY_PRICE_PER_SECOND,
    MAX_COMMUNITY_PRICE_PER_VIDEO_SECOND,
    MIN_COMMUNITY_PRICE_PER_MILLION_TOKENS,
    MIN_COMMUNITY_PRICE_PER_TOKEN,
} from "@shared/community-endpoints.ts";
import { describe, expect, it } from "vitest";
import {
    basePriceKeysForModality,
    hasValidVisibleFormPrices,
} from "../frontend/src/components/community-endpoints/price-table.tsx";
import {
    emptyForm,
    formPriceToStoredPrice,
    isValidPriceInput,
    pricePerMillionToPerToken,
    storedPriceToFormValue,
} from "../frontend/src/components/community-endpoints/types.ts";

describe("community endpoint price input", () => {
    it("allows publishing embeddings with only an input-token price", () => {
        const visiblePriceKeys = new Set(basePriceKeysForModality("embedding"));

        expect([...visiblePriceKeys]).toEqual(["promptTextPrice"]);
        expect(
            hasValidVisibleFormPrices(
                { ...emptyForm, modality: "embedding" },
                visiblePriceKeys,
            ),
        ).toBe(true);
    });

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

    it("converts prices between per-token storage and per-million input", () => {
        expect(formPriceToStoredPrice("30")).toBe(0.00003);
        expect(storedPriceToFormValue(0.00003)).toBe("30");
    });

    it("keeps fixed per-image prices unscaled", () => {
        expect(formPriceToStoredPrice("0.03", "image")).toBe(0.03);
        expect(storedPriceToFormValue(0.03, "image")).toBe("0.03");
        expect(isValidPriceInput("0.000000001", "image")).toBe(true);
    });

    it("rejects prices above the configured ceilings", () => {
        expect(
            isValidPriceInput(String(MAX_COMMUNITY_PRICE_PER_MILLION_TOKENS)),
        ).toBe(true);
        expect(
            isValidPriceInput(
                String(MAX_COMMUNITY_PRICE_PER_MILLION_TOKENS + 1),
            ),
        ).toBe(false);
        expect(
            isValidPriceInput(String(MAX_COMMUNITY_PRICE_PER_IMAGE), "image"),
        ).toBe(true);
        expect(
            isValidPriceInput(
                String(MAX_COMMUNITY_PRICE_PER_IMAGE + 0.01),
                "image",
            ),
        ).toBe(false);
    });

    it("keeps per-second audio prices unscaled with a per-second ceiling", () => {
        expect(formPriceToStoredPrice("0.0000445", "second")).toBe(0.0000445);
        expect(storedPriceToFormValue(0.0000445, "second")).toBe("0.0000445");
        expect(isValidPriceInput("0.0000445", "second")).toBe(true);
        expect(
            isValidPriceInput(String(MAX_COMMUNITY_PRICE_PER_SECOND), "second"),
        ).toBe(true);
        expect(
            isValidPriceInput(
                String(MAX_COMMUNITY_PRICE_PER_SECOND + 0.001),
                "second",
            ),
        ).toBe(false);
        // Per-second rates are tiny; the per-million floor must not apply.
        expect(isValidPriceInput("0.0000000000001", "second")).toBe(true);
    });

    it("keeps video-second prices unscaled with the video ceiling", () => {
        expect(formPriceToStoredPrice("0.08", "video_second")).toBe(0.08);
        expect(storedPriceToFormValue(0.08, "video_second")).toBe("0.08");
        expect(
            isValidPriceInput(
                String(MAX_COMMUNITY_PRICE_PER_VIDEO_SECOND),
                "video_second",
            ),
        ).toBe(true);
        expect(
            isValidPriceInput(
                String(MAX_COMMUNITY_PRICE_PER_VIDEO_SECOND + 0.01),
                "video_second",
            ),
        ).toBe(false);
    });

    it("allows publishing speech models with only a completion-audio price", () => {
        const visiblePriceKeys = new Set(basePriceKeysForModality("speech"));

        expect([...visiblePriceKeys]).toEqual(["completionAudioPrice"]);
        expect(
            hasValidVisibleFormPrices(
                { ...emptyForm, modality: "speech" },
                visiblePriceKeys,
            ),
        ).toBe(true);
    });

    it("scales speech prices per 1M characters with the per-million ceiling", () => {
        expect(formPriceToStoredPrice("10")).toBe(0.00001);
        expect(storedPriceToFormValue(0.00001)).toBe("10");
        expect(isValidPriceInput("10")).toBe(true);
        expect(
            isValidPriceInput(String(MAX_COMMUNITY_PRICE_PER_MILLION_TOKENS)),
        ).toBe(true);
        expect(
            isValidPriceInput(
                String(MAX_COMMUNITY_PRICE_PER_MILLION_TOKENS + 1),
            ),
        ).toBe(false);
    });
});
