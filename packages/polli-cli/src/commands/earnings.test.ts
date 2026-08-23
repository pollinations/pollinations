import { describe, expect, it } from "vitest";
import {
    type EarningsRow,
    earningsSummary,
    earningsTableRows,
} from "./earnings.js";

function makeRow(
    overrides: Partial<EarningsRow> = {},
): EarningsRow {
    return {
        date: "2026-08-01",
        entity_id: "app-1",
        entity_name: "My App",
        source: "byop_markup",
        requests: 100,
        paid_requests: 50,
        tier_requests: 50,
        baseline_price: 0,
        pollen_earned: 5,
        paid_earned: 3,
        tier_earned: 2,
        cost_usd: 0.01,
        reward_rate: 0.5,
        ...overrides,
    };
}

describe("earningsSummary", () => {
    it("returns zeros for empty input", () => {
        expect(earningsSummary([])).toEqual({
            totalPollen: 0,
            totalRequests: 0,
        });
    });

    it("sums pollen and requests across rows", () => {
        const rows = [
            makeRow({ pollen_earned: 10, requests: 200 }),
            makeRow({ pollen_earned: 5.5, requests: 100 }),
        ];
        expect(earningsSummary(rows)).toEqual({
            totalPollen: 15.5,
            totalRequests: 300,
        });
    });
});

describe("earningsTableRows", () => {
    it("maps byop_markup source to app type", () => {
        const rows = earningsTableRows([
            makeRow({ source: "byop_markup", entity_name: "My App" }),
        ]);
        expect(rows[0]).toMatchObject({ type: "app", entity: "My App" });
    });

    it("maps community_model source to model type", () => {
        const rows = earningsTableRows([
            makeRow({
                source: "community_model",
                entity_name: "my-model",
                entity_id: "model-1",
            }),
        ]);
        expect(rows[0]).toMatchObject({ type: "model", entity: "my-model" });
    });

    it("falls back to entity_id when entity_name is empty", () => {
        const rows = earningsTableRows([
            makeRow({ entity_name: "", entity_id: "fallback-id" }),
        ]);
        expect(rows[0]).toMatchObject({ entity: "fallback-id" });
    });

    it("formats pollen to 4 decimal places", () => {
        const rows = earningsTableRows([makeRow({ pollen_earned: 1.23456789 })]);
        expect(rows[0]).toMatchObject({ pollen: "1.2346" });
    });
});
