import { describe, expect, it } from "vitest";
import { parseDays, summarizeEarnings } from "./earnings.js";

describe("summarizeEarnings", () => {
    const row = (overrides: Partial<Record<string, unknown>> = {}) => ({
        date: "2026-08-24",
        entity_id: "app-1",
        entity_name: "My App",
        source: "byop_markup" as const,
        requests: 100,
        paid_requests: 80,
        tier_requests: 20,
        baseline_price: 0.01,
        pollen_earned: 5,
        paid_earned: 4,
        tier_earned: 1,
        cost_usd: 0.5,
        reward_rate: 1,
        ...overrides,
    });

    it("rolls up a total and per-entity breakdown", () => {
        const summary = summarizeEarnings(
            {
                daily: [],
                perEntity: [
                    row({ entity_id: "app-1", pollen_earned: 4, requests: 80 }),
                    row({
                        entity_id: "model-1",
                        entity_name: "My Model",
                        source: "community_model",
                        pollen_earned: 6,
                        requests: 20,
                    }),
                ],
            },
            30,
        );

        expect(summary.days).toBe(30);
        expect(summary.totalPollen).toBe(10);
        expect(summary.totalRequests).toBe(100);
        expect(summary.entities).toHaveLength(2);
        expect(summary.entities[0]).toEqual({
            entity_id: "app-1",
            entity_name: "My App",
            source: "byop_markup",
            requests: 80,
            pollen_earned: 4,
        });
    });

    it("handles an empty earnings response", () => {
        const summary = summarizeEarnings({ daily: [], perEntity: [] }, 30);
        expect(summary.totalPollen).toBe(0);
        expect(summary.totalRequests).toBe(0);
        expect(summary.entities).toEqual([]);
    });
});

describe("parseDays", () => {
    it("accepts a positive integer", () => {
        expect(parseDays("30")).toBe(30);
    });

    it("rejects non-positive or non-integer values", () => {
        expect(() => parseDays("0")).toThrow();
        expect(() => parseDays("-1")).toThrow();
        expect(() => parseDays("abc")).toThrow();
    });
});
