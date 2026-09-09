import { roundPollenLedgerAmount } from "@shared/billing/precision.ts";
import { describe, expect, it } from "vitest";

describe("roundPollenLedgerAmount", () => {
    it("snaps to POLLEN_BILLING_PRECISION decimal places", () => {
        expect(roundPollenLedgerAmount(0.123456789)).toBe(0.12345679);
    });

    it("removes float cruft from sums of disparate-magnitude charges", () => {
        // The kind of cruft that appears when you add base price + markup.
        expect(roundPollenLedgerAmount(0.1 + 0.2)).toBe(0.3);
    });

    it("drops sub-precision amounts to zero (positive and negative)", () => {
        expect(roundPollenLedgerAmount(1e-9)).toBe(0);
        // Negative sub-precision must collapse to +0, not -0. Object.is is the
        // only way to distinguish the two — toBe(0) accepts either.
        expect(Object.is(roundPollenLedgerAmount(-1e-9), 0)).toBe(true);
    });

    it("preserves amounts already at the precision boundary", () => {
        expect(roundPollenLedgerAmount(0.00000001)).toBe(0.00000001);
        expect(roundPollenLedgerAmount(1.23456789)).toBe(1.23456789);
    });

    it("rejects non-finite inputs", () => {
        for (const amount of [
            Number.NaN,
            Number.POSITIVE_INFINITY,
            Number.NEGATIVE_INFINITY,
        ]) {
            expect(() => roundPollenLedgerAmount(amount)).toThrow(RangeError);
        }
    });
});
