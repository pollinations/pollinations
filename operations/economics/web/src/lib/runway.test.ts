import { describe, expect, it } from "vitest";
import type { OpForecastRow, OpTransactionRow } from "../types";
import { buildRunway } from "./runway";

const NOW = new Date("2026-08-24T12:00:00.000Z");

const transaction = (
    overrides: Partial<OpTransactionRow> = {},
): OpTransactionRow => ({
    entry_id: "wise-transaction",
    kind: "transaction",
    source: "wise",
    date: "2026-08-10",
    vendor: "aws",
    category: "cloud",
    amount: -100,
    currency: "USD",
    description: "AWS",
    evidence: "Wise statement",
    recorded_at: "2026-08-24 00:00:00.000",
    ...overrides,
});

const opening = (
    amount = 1_000,
    overrides: Partial<OpTransactionRow> = {},
): OpTransactionRow =>
    transaction({
        entry_id: "wise-opening-usd",
        kind: "opening_balance",
        date: "2026-01-01",
        vendor: "wise",
        category: "balance_sheet",
        amount,
        description: "Statement opening balance",
        ...overrides,
    });

const forecast = (overrides: Partial<OpForecastRow> = {}): OpForecastRow => ({
    entry_id: "forecast-2026-08-aws",
    month: "2026-08-01",
    vendor: "aws",
    category: "compute",
    amount: -300,
    currency: "USD",
    method: "last",
    source: "agent",
    evidence: "July bank total",
    recorded_at: "2026-08-24 00:00:00.000",
    ...overrides,
});

describe("buildRunway", () => {
    it("adds only the remaining current-month plan to current cash", () => {
        const result = buildRunway(
            [
                opening(),
                transaction(),
                transaction({
                    entry_id: "oss",
                    vendor: "estonia",
                    category: "admin",
                    amount: -50,
                }),
            ],
            [
                forecast(),
                forecast({
                    entry_id: "forecast-2026-09-aws",
                    month: "2026-09-01",
                }),
            ],
            NOW,
        );

        expect(result.currentCashUsd).toBe(850);
        expect(result.remainingCurrentPlanUsd).toBe(-200);
        expect(result.projectedMonthEndCashUsd).toBe(650);
        expect(result.flags).not.toEqual(
            expect.arrayContaining([expect.stringContaining("observed")]),
        );
    });

    it("does not invent a refund when an expense already exceeds plan", () => {
        const result = buildRunway(
            [opening(), transaction({ amount: -400 })],
            [
                forecast(),
                forecast({
                    entry_id: "forecast-2026-09-aws",
                    month: "2026-09-01",
                }),
            ],
            NOW,
        );

        expect(result.currentCashUsd).toBe(600);
        expect(result.remainingCurrentPlanUsd).toBe(0);
        expect(result.projectedMonthEndCashUsd).toBe(600);
    });

    it("does not subtract revenue that already exceeds plan", () => {
        const result = buildRunway(
            [
                opening(),
                transaction({
                    vendor: "stripe",
                    category: "revenue",
                    amount: 500,
                }),
            ],
            [
                forecast({
                    vendor: "stripe",
                    category: "revenue",
                    amount: 300,
                }),
                forecast({
                    entry_id: "forecast-2026-09-stripe",
                    month: "2026-09-01",
                    vendor: "stripe",
                    category: "revenue",
                    amount: 300,
                }),
            ],
            NOW,
        );

        expect(result.currentCashUsd).toBe(1_500);
        expect(result.remainingCurrentPlanUsd).toBe(0);
    });

    it("matches current plans by vendor and cash direction, not category", () => {
        const result = buildRunway(
            [
                opening(),
                transaction({
                    entry_id: "deel-payroll",
                    vendor: "deel",
                    category: "payroll",
                    amount: -100,
                }),
                transaction({
                    entry_id: "deel-refund",
                    vendor: "deel",
                    category: "payroll",
                    amount: 250,
                }),
            ],
            [
                forecast({
                    entry_id: "deel-payroll-plan",
                    vendor: "deel",
                    category: "payroll",
                    amount: -300,
                }),
                forecast({
                    entry_id: "deel-refund-plan",
                    vendor: "deel",
                    category: "balance_sheet",
                    amount: 400,
                    method: "one_off",
                }),
                forecast({
                    entry_id: "forecast-2026-09-aws",
                    month: "2026-09-01",
                }),
            ],
            NOW,
        );

        expect(result.remainingCurrentPlanUsd).toBe(-50);
        expect(result.projectedMonthEndCashUsd).toBe(1_100);
    });

    it("uses every same-date opening currency and excludes anchors from cash change", () => {
        const result = buildRunway(
            [
                opening(1_000, { currency: "EUR" }),
                opening(100, {
                    entry_id: "wise-opening-usd",
                    currency: "USD",
                }),
                transaction({
                    entry_id: "january-cost",
                    date: "2026-01-10",
                    amount: -100,
                    currency: "EUR",
                }),
            ],
            [
                forecast(),
                forecast({
                    entry_id: "forecast-2026-09-aws",
                    month: "2026-09-01",
                }),
            ],
            NOW,
        );
        const january = result.columns.find(
            (column) => column.id === "2026-01:actual",
        );

        expect(result.openingBalanceUsd).toBeCloseTo(1_273.8, 2);
        expect(january?.netUsd).toBeCloseTo(-117.38, 2);
        expect(january?.runningCashUsd).toBeCloseTo(1_156.42, 2);
    });

    it("shows native-currency revaluation as an explicit cash adjustment", () => {
        const result = buildRunway(
            [opening(1_000, { currency: "EUR" })],
            [
                forecast(),
                forecast({
                    entry_id: "forecast-2026-09-aws",
                    month: "2026-09-01",
                }),
            ],
            NOW,
        );
        const january = result.columns.find(
            (column) => column.id === "2026-01:actual",
        );
        const february = result.columns.find(
            (column) => column.id === "2026-02:actual",
        );
        const fxRow = result.rows.find(
            (row) => row.vendor === "fx revaluation",
        );

        expect(january?.netUsd).toBeCloseTo(0, 2);
        expect(february?.netUsd).toBeCloseTo(8.6, 2);
        expect(february?.runningCashUsd).toBeCloseTo(1_182.4, 2);
        expect(fxRow).toMatchObject({ category: "balance_sheet" });
        expect(fxRow?.values["2026-02:actual"]).toBeCloseTo(8.6, 2);
    });

    it("carries post-anchor movements into the accounting window", () => {
        const result = buildRunway(
            [
                opening(1_000, { date: "2025-12-30" }),
                transaction({
                    entry_id: "december-inflow",
                    date: "2025-12-31",
                    vendor: "stripe",
                    category: "revenue",
                    amount: 200,
                }),
                transaction({
                    entry_id: "january-cost",
                    date: "2026-01-10",
                    amount: -100,
                }),
            ],
            [
                forecast(),
                forecast({
                    entry_id: "forecast-2026-09-aws",
                    month: "2026-09-01",
                }),
            ],
            NOW,
        );
        const january = result.columns.find(
            (column) => column.id === "2026-01:actual",
        );
        const adjustment = result.rows.find(
            (row) => row.vendor === "pre-window movements",
        );

        expect(january?.netUsd).toBe(100);
        expect(january?.runningCashUsd).toBe(1_100);
        expect(adjustment?.values["2026-01:actual"]).toBe(200);
    });

    it("rejects multiple opening dates instead of choosing one", () => {
        const result = buildRunway(
            [
                opening(),
                opening(900, {
                    entry_id: "later-opening",
                    date: "2026-07-01",
                }),
            ],
            [forecast()],
            NOW,
        );

        expect(result.currentCashUsd).toBeNull();
        expect(result.flags).toContain(
            "2 opening-balance dates found; keep one statement-backed anchor before calculating cash.",
        );
    });

    it("requires a continuous future forecast before calculating runway", () => {
        const result = buildRunway(
            [opening()],
            [
                forecast({ amount: -100 }),
                forecast({
                    entry_id: "forecast-2026-10-aws",
                    month: "2026-10-01",
                    amount: -100,
                }),
            ],
            NOW,
        );

        expect(result.runwayMonths).toBeNull();
        expect(result.flags).toContain(
            "Forecast gap: 2026-09; runway is unavailable.",
        );
    });

    it("counts only complete future months, excluding the partial current month", () => {
        const result = buildRunway(
            [opening()],
            [
                forecast({ amount: -100 }),
                forecast({
                    entry_id: "forecast-2026-09-aws",
                    month: "2026-09-01",
                    amount: -100,
                }),
                forecast({
                    entry_id: "forecast-2026-10-aws",
                    month: "2026-10-01",
                    amount: -100,
                }),
            ],
            NOW,
        );

        expect(result.projectedMonthEndCashUsd).toBe(900);
        expect(result.runwayMonths).toBe(2);
        expect(result.runwayCapped).toBe(true);
    });

    it("includes cash adjustments in cash change but not expenses", () => {
        const result = buildRunway(
            [opening()],
            [
                forecast({ amount: -100 }),
                forecast({
                    entry_id: "deel-refund",
                    vendor: "deel",
                    category: "balance_sheet",
                    amount: 400,
                    method: "one_off",
                }),
                forecast({
                    entry_id: "forecast-2026-09-aws",
                    month: "2026-09-01",
                    amount: -100,
                }),
            ],
            NOW,
        );
        const augustPlan = result.columns.find(
            (column) => column.id === "2026-08:forecast",
        );

        expect(augustPlan?.totalExpensesUsd).toBe(-100);
        expect(augustPlan?.netUsd).toBe(300);
    });

    it("uses the structured forecast method", () => {
        const result = buildRunway(
            [opening()],
            [
                forecast({ method: "one_off" }),
                forecast({
                    entry_id: "forecast-2026-09-aws",
                    month: "2026-09-01",
                    method: "one_off",
                }),
            ],
            NOW,
        );

        expect(result.rows[0]?.forecastMethod).toBe("one_off");
    });

    it("surfaces invalid categories and methods without guessing", () => {
        const result = buildRunway(
            [opening()],
            [
                forecast({ category: "saas", method: "mystery" as never }),
                forecast({
                    entry_id: "forecast-2026-09-aws",
                    month: "2026-09-01",
                    category: "saas",
                    method: "mystery" as never,
                }),
            ],
            NOW,
        );

        expect(result.rows).toEqual([]);
        expect(result.projectedMonthEndCashUsd).toBeNull();
        expect(result.runwayMonths).toBeNull();
        expect(result.flags).toContain(
            "2 forecast facts need correction (category, method) for aws; month-end cash and runway are unavailable.",
        );
    });

    it("does not crash or project around an unsupported forecast currency", () => {
        const result = buildRunway(
            [opening()],
            [
                forecast({ currency: "GBP" }),
                forecast({
                    entry_id: "forecast-2026-09-aws",
                    month: "2026-09-01",
                    amount: -100,
                }),
            ],
            NOW,
        );

        expect(result.currentCashUsd).toBe(1_000);
        expect(result.projectedMonthEndCashUsd).toBeNull();
        expect(result.runwayMonths).toBeNull();
        expect(result.flags).toContain(
            "1 forecast fact needs correction (currency) for aws; month-end cash and runway are unavailable.",
        );
    });

    it("does not crash or project around an unsupported bank currency", () => {
        const result = buildRunway(
            [
                opening(),
                transaction({
                    entry_id: "bank-gbp",
                    amount: -10,
                    currency: "GBP",
                }),
            ],
            [
                forecast(),
                forecast({
                    entry_id: "forecast-2026-09-aws",
                    month: "2026-09-01",
                }),
            ],
            NOW,
        );

        expect(result.currentCashUsd).toBeNull();
        expect(result.projectedMonthEndCashUsd).toBeNull();
        expect(result.runwayMonths).toBeNull();
        expect(result.flags).toContain(
            "1 bank row uses unsupported currency (GBP); cash balance and runway are unavailable.",
        );
    });

    it("keeps cash unavailable without an opening balance", () => {
        const result = buildRunway([transaction()], [forecast()], NOW);

        expect(result.currentCashUsd).toBeNull();
        expect(result.projectedMonthEndCashUsd).toBeNull();
        expect(result.flags).toContain(
            "No opening bank balance; cash balance and runway are unavailable.",
        );
    });

    it("stops cash projection when a reconstructed native balance is impossible", () => {
        const result = buildRunway(
            [opening(50), transaction({ amount: -100 })],
            [
                forecast(),
                forecast({
                    entry_id: "forecast-2026-09-aws",
                    month: "2026-09-01",
                }),
            ],
            NOW,
        );

        expect(result.currentCashUsd).toBeNull();
        expect(result.projectedMonthEndCashUsd).toBeNull();
        expect(result.runwayMonths).toBeNull();
        expect(result.flags).toContain(
            "Native bank balance becomes negative in USD (2026-08); add missing statement movements before calculating cash.",
        );
    });

    it("does not treat bank rows beyond the forecast horizon as exhaustion", () => {
        const result = buildRunway(
            [
                opening(),
                transaction({
                    entry_id: "future-refund",
                    date: "2027-05-01",
                    vendor: "deel",
                    category: "balance_sheet",
                    amount: 500,
                }),
            ],
            [
                forecast({ amount: -100 }),
                forecast({
                    entry_id: "forecast-2026-09-aws",
                    month: "2026-09-01",
                    amount: -100,
                }),
                forecast({
                    entry_id: "forecast-2026-10-aws",
                    month: "2026-10-01",
                    amount: -100,
                }),
            ],
            NOW,
        );

        expect(result.runwayMonths).toBe(2);
        expect(result.runwayExhaustedMonth).toBeNull();
        expect(result.runwayCapped).toBe(true);
    });
});
