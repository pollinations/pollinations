import { describe, expect, it } from "vitest";
import {
    type EarningsResponse,
    type EarningsRow,
    parseEarningsDays,
    summarizeEarnings,
} from "../src/commands/earnings.js";

const row = (over: Partial<EarningsRow> = {}): EarningsRow => ({
    date: "",
    entity_id: "e1",
    entity_name: "My App",
    source: "byop_markup",
    requests: 10,
    paid_requests: 4,
    tier_requests: 6,
    baseline_price: 0.5,
    pollen_earned: 1.5,
    paid_earned: 0.9,
    tier_earned: 0.6,
    cost_usd: 2,
    reward_rate: 0.15,
    ...over,
});

describe("parseEarningsDays", () => {
    it("accepts integers within the API window", () => {
        expect(parseEarningsDays("1")).toBe(1);
        expect(parseEarningsDays("30")).toBe(30);
        expect(parseEarningsDays("90")).toBe(90);
    });

    it.each(["0", "-5", "91", "abc", "3.5", ""])("rejects %s", (value) => {
        expect(parseEarningsDays(value)).toBeNull();
    });
});

describe("summarizeEarnings", () => {
    it("totals additive fields across entities", () => {
        const response: EarningsResponse = {
            daily: [],
            perEntity: [
                row(),
                row({
                    entity_id: "m1",
                    entity_name: "model-x",
                    source: "community_model",
                    requests: 5,
                    pollen_earned: 0.5,
                    cost_usd: 1,
                }),
            ],
        };
        expect(summarizeEarnings(response)).toEqual({
            requests: 15,
            paid_requests: 8,
            tier_requests: 12,
            pollen_earned: 2,
            cost_usd: 3,
        });
    });

    it("handles an empty period", () => {
        expect(summarizeEarnings({ daily: [], perEntity: [] })).toEqual({
            requests: 0,
            paid_requests: 0,
            tier_requests: 0,
            pollen_earned: 0,
            cost_usd: 0,
        });
    });

    it("treats a missing perEntity array as zero totals", () => {
        const response = { daily: [] } as unknown as EarningsResponse;
        expect(summarizeEarnings(response).pollen_earned).toBe(0);
    });
});
