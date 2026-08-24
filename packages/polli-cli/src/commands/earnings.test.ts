import { describe, expect, it } from "vitest";
import { daysError, summarizeBySource } from "./earnings.js";

describe("daysError", () => {
    it("accepts positive integers", () => {
        expect(daysError("1")).toBeNull();
        expect(daysError("30")).toBeNull();
        expect(daysError("90")).toBeNull();
    });

    it("rejects non-integers and non-positive values", () => {
        expect(daysError("0")).toMatch(/positive integer/);
        expect(daysError("-5")).toMatch(/positive integer/);
        expect(daysError("abc")).toMatch(/positive integer/);
        expect(daysError("7.5")).toMatch(/positive integer/);
        expect(daysError("")).toMatch(/positive integer/);
    });

    it("rejects values above the API's 90-day window", () => {
        expect(daysError("91")).toMatch(/90 or less/);
    });
});

describe("summarizeBySource", () => {
    const daily = [
        {
            date: "2026-08-23",
            entity_id: "pk_a",
            entity_name: "app-a",
            source: "byop_markup",
            requests: 4,
            baseline_price: 2,
            pollen_earned: 0.5,
            paid_earned: 0.125,
            tier_earned: 0.375,
            cost_usd: 0.02,
            reward_rate: 0.25,
        },
        {
            date: "2026-08-23",
            entity_id: "mdl_b",
            entity_name: "model-b",
            source: "community_model",
            requests: 10,
            baseline_price: 5,
            pollen_earned: 1,
            paid_earned: 1,
            tier_earned: 0,
            cost_usd: 0.05,
            reward_rate: 0.2,
        },
        {
            date: "2026-08-24",
            entity_id: "pk_a",
            entity_name: "app-a",
            source: "byop_markup",
            requests: 6,
            baseline_price: 3,
            pollen_earned: 0.75,
            paid_earned: 0.25,
            tier_earned: 0.5,
            cost_usd: 0.03,
            reward_rate: 0.25,
        },
    ];

    it("rolls daily buckets into additive totals per source", () => {
        const summary = summarizeBySource(daily);

        expect(summary).toHaveLength(2);

        const byop = summary.find((s) => s.source === "byop_markup");
        expect(byop).toEqual({
            source: "byop_markup",
            requests: 10,
            pollenEarned: 1.25,
            usdBasis: 0.05,
        });

        const community = summary.find((s) => s.source === "community_model");
        expect(community).toEqual({
            source: "community_model",
            requests: 10,
            pollenEarned: 1,
            usdBasis: 0.05,
        });
    });

    it("returns an empty summary for empty input", () => {
        expect(summarizeBySource([])).toEqual([]);
    });
});
