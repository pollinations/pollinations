import { describe, expect, it } from "vitest";
import { type EarningsRow, totalPollenEarned } from "./earnings.js";

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
