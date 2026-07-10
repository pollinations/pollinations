import { describe, expect, it } from "vitest";
import type { OpRunwayRow, OpTransactionRow } from "../types";
import { buildRunway, forecastMethodFromEvidence } from "./runway";

const NOW = new Date("2026-07-10T12:00:00Z");

const transaction = (
    overrides: Partial<OpTransactionRow>,
): OpTransactionRow => ({
    source: "wise",
    date: "2026-07-05",
    vendor: "aws",
    category: "cloud",
    amount: 0,
    currency: "USD",
    description: "",
    evidence: "",
    recorded_at: "2026-07-10 00:00:00",
    ...overrides,
});

const fact = (overrides: Partial<OpRunwayRow>): OpRunwayRow => ({
    entry_id: "fact",
    kind: "forecast",
    date: "2026-07-01",
    vendor: "aws",
    category: "cloud",
    amount: 0,
    currency: "USD",
    source: "agent",
    evidence: "",
    recorded_at: "2026-07-10 00:00:00.000",
    ...overrides,
});

const opening = (amount = 10_000): OpRunwayRow =>
    fact({
        entry_id: "opening",
        kind: "opening_balance",
        vendor: "",
        category: "",
        amount,
        source: "manual",
    });

describe("buildRunway", () => {
    it("reads only the two supported forecast methods from evidence", () => {
        expect(
            forecastMethodFromEvidence(
                "method=last; basis=wise; month=2026-06",
            ),
        ).toBe("last");
        expect(forecastMethodFromEvidence("basis=wise; method=zero")).toBe(
            "zero",
        );
        expect(forecastMethodFromEvidence("method=avg3")).toBeNull();
    });

    it("keeps current actuals separate from the full-month forecast", () => {
        const result = buildRunway(
            [
                transaction({
                    date: "2026-06-05",
                    vendor: "stripe",
                    category: "revenue",
                    amount: 1_000,
                }),
                transaction({ amount: -500 }),
            ],
            [
                opening(),
                fact({
                    entry_id: "jul-aws",
                    amount: -1_000,
                    evidence: "method=last; basis=wise; month=2026-06",
                }),
                fact({
                    entry_id: "jul-stripe",
                    vendor: "stripe",
                    category: "revenue",
                    amount: 2_000,
                }),
                fact({
                    entry_id: "aug-aws",
                    date: "2026-08-01",
                    amount: -1_000,
                }),
                fact({
                    entry_id: "aug-stripe",
                    date: "2026-08-01",
                    vendor: "stripe",
                    category: "revenue",
                    amount: 2_000,
                }),
            ],
            NOW,
        );

        const aws = result.rows.find((row) => row.vendor === "aws");
        const stripe = result.rows.find((row) => row.vendor === "stripe");
        expect(
            result.columns
                .filter((column) => column.month === "2026-07")
                .map((column) => column.kind),
        ).toEqual(["current", "forecast"]);
        expect(stripe?.values["2026-06:actual"]).toBe(1_000);
        expect(aws?.values["2026-07:current"]).toBe(-500);
        expect(aws?.values["2026-07:forecast"]).toBe(-1_000);
        expect(aws?.assumptions["2026-07:current"]).toBeUndefined();
        expect(aws?.assumptions["2026-07:forecast"]?.[0].source).toBe("agent");
        expect(aws?.forecastMethod).toBe("last");
        expect(stripe?.values["2026-07:current"]).toBe(0);
        expect(stripe?.values["2026-07:forecast"]).toBe(2_000);
        expect(aws?.values["2026-08:forecast"]).toBe(-1_000);
        expect(result.mtdCashUsd).toBe(9_500);
        expect(result.projectedMonthEndCashUsd).toBe(11_000);
        expect(
            result.columns.find((column) => column.id === "2026-08:forecast"),
        ).toMatchObject({
            totalExpensesUsd: -1_000,
            netUsd: 1_000,
            runningCashUsd: 12_000,
        });
    });

    it("counts positive displayed months until cash reaches zero", () => {
        const result = buildRunway(
            [],
            [
                opening(2_000),
                fact({ entry_id: "jul", amount: -500 }),
                fact({ entry_id: "aug", date: "2026-08-01", amount: -800 }),
                fact({ entry_id: "sep", date: "2026-09-01", amount: -800 }),
            ],
            NOW,
        );

        expect(result.projectedMonthEndCashUsd).toBe(1_500);
        expect(result.runwayMonths).toBe(2);
        expect(result.runwayExhaustedMonth).toBe("2026-09");
        expect(result.runwayCapped).toBe(false);
    });

    it("marks runway as capped when cash stays positive through the horizon", () => {
        const result = buildRunway(
            [],
            [
                opening(2_000),
                fact({ entry_id: "jul", amount: -100 }),
                fact({ entry_id: "aug", date: "2026-08-01", amount: -100 }),
            ],
            NOW,
        );

        expect(result.runwayMonths).toBe(2);
        expect(result.runwayCapped).toBe(true);
        expect(result.runwayExhaustedMonth).toBeNull();
    });

    it("keeps running cash unavailable without an opening balance", () => {
        const result = buildRunway(
            [],
            [fact({ entry_id: "jul", amount: -100 })],
            NOW,
        );

        expect(result.projectedMonthEndCashUsd).toBeNull();
        expect(result.runwayMonths).toBeNull();
        expect(result.flags[0]).toContain("No opening balance");
    });

    it("selects the latest opening balance and flags multiple anchors", () => {
        const result = buildRunway(
            [],
            [
                opening(1_000),
                fact({
                    entry_id: "new-opening",
                    kind: "opening_balance",
                    vendor: "",
                    category: "",
                    amount: 3_000,
                    source: "manual",
                    recorded_at: "2026-07-10 01:00:00.000",
                }),
                fact({ entry_id: "jul", amount: -500 }),
            ],
            NOW,
        );

        expect(result.openingBalanceUsd).toBe(3_000);
        expect(result.projectedMonthEndCashUsd).toBe(2_500);
        expect(result.flags).toContain(
            "2 opening balance facts found; using the latest effective date.",
        );
    });

    it("selects the latest effective opening date before its revision timestamp", () => {
        const result = buildRunway(
            [],
            [
                fact({
                    entry_id: "current-opening",
                    kind: "opening_balance",
                    date: "2026-07-01",
                    vendor: "",
                    category: "",
                    amount: 3_000,
                    source: "manual",
                }),
                fact({
                    entry_id: "late-backfill",
                    kind: "opening_balance",
                    date: "2026-06-01",
                    vendor: "",
                    category: "",
                    amount: 1_000,
                    source: "manual",
                    recorded_at: "2026-07-10 02:00:00.000",
                }),
                fact({ entry_id: "jul", amount: -500 }),
                fact({ entry_id: "aug", date: "2026-08-01", amount: -500 }),
            ],
            NOW,
        );

        expect(result.openingBalanceDate).toBe("2026-07-01");
        expect(result.projectedMonthEndCashUsd).toBe(2_500);
    });

    it("defines expenses by category so refunds and revenue adjustments stay signed", () => {
        const result = buildRunway(
            [],
            [
                opening(),
                fact({ entry_id: "cloud-cost", amount: -1_000 }),
                fact({
                    entry_id: "cloud-refund",
                    vendor: "gcp refund",
                    amount: 200,
                }),
                fact({
                    entry_id: "revenue-adjustment",
                    vendor: "stripe",
                    category: "revenue",
                    amount: -100,
                }),
                fact({ entry_id: "aug", date: "2026-08-01", amount: 0 }),
            ],
            NOW,
        );

        const july = result.columns.find(
            (column) => column.id === "2026-07:forecast",
        );
        expect(july?.totalExpensesUsd).toBe(-800);
        expect(july?.netUsd).toBe(-900);
    });

    it("converts explicit EUR assumptions with the Treasury FX table", () => {
        const result = buildRunway(
            [],
            [
                opening(),
                fact({
                    entry_id: "jul-eur",
                    amount: -100,
                    currency: "EUR",
                }),
            ],
            NOW,
        );

        expect(result.rows[0].values["2026-07:forecast"]).toBeCloseTo(
            -114.11,
            2,
        );
    });

    it("treats absent vendor forecasts as zero while flagging whole-month gaps", () => {
        const result = buildRunway(
            [],
            [
                opening(),
                fact({ entry_id: "jul", amount: -100 }),
                fact({ entry_id: "sep", date: "2026-09-01", amount: -100 }),
            ],
            NOW,
        );

        expect(result.rows[0].values["2026-08:forecast"]).toBe(0);
        expect(result.flags).toContain(
            "No forecast facts for 2026-08; that month is treated as zero.",
        );
    });

    it("flags a non-month-start opening balance while preserving parity math", () => {
        const result = buildRunway(
            [],
            [
                fact({
                    entry_id: "opening",
                    kind: "opening_balance",
                    date: "2026-07-10",
                    vendor: "",
                    category: "",
                    amount: 1_000,
                }),
                fact({ entry_id: "jul", amount: -100 }),
            ],
            NOW,
        );

        expect(result.projectedMonthEndCashUsd).toBe(900);
        expect(
            result.flags.some((flag) => flag.includes("not the first day")),
        ).toBe(true);
    });

    it("flags a pre-window opening balance instead of silently losing it", () => {
        const result = buildRunway(
            [],
            [
                fact({
                    entry_id: "opening",
                    kind: "opening_balance",
                    date: "2025-12-01",
                    vendor: "",
                    category: "",
                    amount: 1_000,
                }),
                fact({ entry_id: "jul", amount: -100 }),
                fact({ entry_id: "aug", date: "2026-08-01", amount: -100 }),
            ],
            NOW,
        );

        expect(result.projectedMonthEndCashUsd).toBeNull();
        expect(result.flags.some((flag) => flag.includes("predates"))).toBe(
            true,
        );
    });
});
