import { describe, expect, it } from "vitest";
import { getAvailableBalance } from "@/middleware/balance.ts";

describe("getAvailableBalance", () => {
    it("sums all positive buckets for regular models", () => {
        expect(
            getAvailableBalance({
                tierBalance: 0.1,
                devBalance: 0.15,
                packBalance: 0.2,
                cryptoBalance: 0.3,
            }),
        ).toBeCloseTo(0.75);
    });

    it("excludes only tier for paid-only models", () => {
        expect(
            getAvailableBalance(
                {
                    tierBalance: 10,
                    devBalance: 2,
                    packBalance: 0.5,
                    cryptoBalance: 0,
                },
                true,
            ),
        ).toBeCloseTo(2.5);
    });

    it("ignores negative buckets", () => {
        expect(
            getAvailableBalance({
                tierBalance: -1,
                devBalance: -0.2,
                packBalance: 0.3,
                cryptoBalance: -0.5,
            }),
        ).toBeCloseTo(0.3);
    });

    it("returns 0 when all buckets are negative or zero", () => {
        expect(
            getAvailableBalance({
                tierBalance: -1,
                devBalance: 0,
                packBalance: 0,
                cryptoBalance: -2,
            }),
        ).toBe(0);
    });
});
