import { describe, expect, it } from "vitest";
import {
    type EarningsRow,
    MAX_EARNINGS_DAYS,
    parseDaysWindow,
    totalPollenEarned,
} from "./earnings.js";

const row = (overrides: Partial<EarningsRow> = {}): EarningsRow => ({
    date: "",
    entity_id: "app_1",
    entity_name: "My App",
    source: "byop_markup",
    requests: 10,
    baseline_price: 0.5,
    pollen_earned: 0.1,
    paid_earned: 0.08,
    tier_earned: 0.02,
    cost_usd: 0.5,
    reward_rate: 0.2,
    ...overrides,
});

describe("parseDaysWindow", () => {
    it("accepts a plain day count", () => {
        expect(parseDaysWindow("30")).toBe(30);
    });

    it("rejects zero, negatives and non-integers", () => {
        expect(() => parseDaysWindow("0")).toThrow(
            "--days must be a positive integer",
        );
        expect(() => parseDaysWindow("-5")).toThrow(
            "--days must be a positive integer",
        );
        expect(() => parseDaysWindow("1.5")).toThrow(
            "--days must be a positive integer",
        );
        expect(() => parseDaysWindow("abc")).toThrow(
            "--days must be a positive integer",
        );
    });

    it("rejects windows beyond the API maximum", () => {
        expect(() => parseDaysWindow(String(MAX_EARNINGS_DAYS + 1))).toThrow(
            `--days must be ${MAX_EARNINGS_DAYS} or less`,
        );
        expect(parseDaysWindow(String(MAX_EARNINGS_DAYS))).toBe(
            MAX_EARNINGS_DAYS,
        );
    });
});

describe("totalPollenEarned", () => {
    it("sums pollen across entities", () => {
        const perEntity = [
            row({ pollen_earned: 0.1 }),
            row({ pollen_earned: 2.5 }),
        ];
        expect(totalPollenEarned(perEntity)).toBeCloseTo(2.6);
    });

    it("returns 0 for an empty rollup", () => {
        expect(totalPollenEarned([])).toBe(0);
    });
});
