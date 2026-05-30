import { describe, expect, it } from "vitest";
import { getAvailableBalance } from "@/middleware/balance.ts";

describe("getAvailableBalance", () => {
    it("sums all positive buckets for regular models", () => {
        expect(
            getAvailableBalance({
                rewardBalance: 0.1,
                paidBalance: 0.2,
            }),
        ).toBeCloseTo(0.3);
    });

    it("excludes reward for paid-only models", () => {
        expect(
            getAvailableBalance({ rewardBalance: 10, paidBalance: 0.5 }, true),
        ).toBeCloseTo(0.5);
    });

    it("ignores negative buckets", () => {
        expect(
            getAvailableBalance({
                rewardBalance: -1,
                paidBalance: 0.3,
            }),
        ).toBeCloseTo(0.3);
    });

    it("returns 0 when all buckets are negative or zero", () => {
        expect(
            getAvailableBalance({
                rewardBalance: -1,
                paidBalance: 0,
            }),
        ).toBe(0);
    });
});
