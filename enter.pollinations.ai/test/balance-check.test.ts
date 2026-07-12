import { describe, expect, it } from "vitest";
import { getAvailableBalance } from "@/middleware/balance.ts";

describe("getAvailableBalance", () => {
    it("sums all positive buckets for regular models", () => {
        expect(
            getAvailableBalance({
                tierBalance: 0.1,
                packBalance: 0.2,
            }),
        ).toBeCloseTo(0.3);
    });

    it("excludes tier for paid-only models", () => {
        expect(
            getAvailableBalance({ tierBalance: 10, packBalance: 0.5 }, true),
        ).toBeCloseTo(0.5);
    });

    it("ignores negative buckets", () => {
        expect(
            getAvailableBalance({
                tierBalance: -1,
                packBalance: 0.3,
            }),
        ).toBeCloseTo(0.3);
    });

    it("returns 0 when all buckets are negative or zero", () => {
        expect(
            getAvailableBalance({
                tierBalance: -1,
                packBalance: 0,
            }),
        ).toBe(0);
    });
});
