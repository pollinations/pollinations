import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PRIVATE_CONFIG_FIXTURE } from "../fixtures";
import { automaticForecastRule, forecastLineRule } from "../lib/forecastTerms";
import { buildRunway, type RunwayMatrixRow } from "../lib/runway";
import type { Data, StripeSalesRow } from "../types";
import {
    CashAdjustmentRows,
    cashAdjustmentValue,
    fmtRunwayTableValue,
    fmtRunwayUsd,
    groupRunwayVendors,
    RunwayTab,
    runwayDetailRows,
    runwayMonthLabel,
    runwayPeriodText,
    runwayValueClass,
} from "./RunwayTab";

afterEach(() => {
    vi.useRealTimers();
});

describe("RunwayTab labels", () => {
    it("sorts by last month's spending and collapses small vendors without changing the source", () => {
        const base: RunwayMatrixRow = {
            vendor: "example",
            category: "development",
            values: {},
            assumptions: {},
            forecastMethod: null,
            forecastPaymentTiming: null,
        };
        const rows: RunwayMatrixRow[] = [
            { ...base, vendor: "small", values: { "2026-09:actual": -9.99 } },
            { ...base, vendor: "boundary", values: { "2026-09:actual": -10 } },
            { ...base, vendor: "old", values: { "2026-08:actual": -500 } },
            { ...base, vendor: "largest", values: { "2026-09:actual": -100 } },
            {
                ...base,
                vendor: "credits",
                values: { "2026-09:actual": -5 },
                creditValues: { "2026-09:actual": -20 },
            },
            {
                ...base,
                vendor: "upcoming",
                values: { "2027-01:forecast": -10 },
            },
            {
                ...base,
                vendor: "small-plan",
                values: { "2026-11:forecast": -9.99 },
            },
            {
                ...base,
                vendor: "unknown",
                actualIssues: { "2026-09:actual": "Missing usage" },
            },
            {
                ...base,
                vendor: "unknown-plan",
                forecastIssue: "Missing balance",
            },
        ];
        const original = structuredClone(rows);
        const { primary, more } = groupRunwayVendors(rows, "2026-10");
        expect(primary.map((row) => row.vendor)).toEqual([
            "largest",
            "credits",
            "boundary",
            "upcoming",
            "unknown",
            "unknown-plan",
        ]);
        expect(more.map((row) => row.vendor)).toEqual([
            "small",
            "old",
            "small-plan",
        ]);
        expect([...primary, ...more]).toHaveLength(rows.length);
        expect(rows).toEqual(original);
        expect(
            groupRunwayVendors(
                [{ ...base, values: { "2025-12:actual": -10 } }],
                "2026-01",
            ).primary,
        ).toHaveLength(1);
    });

    it("combines Polar receipts with customer payments without changing totals or sources", () => {
        const base = {
            category: "revenue",
            forecastMethod: null,
            forecastPaymentTiming: null,
            assumptions: {},
        } as const;
        const rows: RunwayMatrixRow[] = [
            {
                ...base,
                vendor: "stripe sales",
                values: { january: 95, february: null, plan: 190 },
                details: [
                    {
                        label: "Gross customer payments",
                        values: { january: 100, plan: 200 },
                    },
                    {
                        label: "Stripe fees",
                        values: { january: -5, plan: -10 },
                    },
                ],
            },
            {
                ...base,
                vendor: "polar",
                values: { january: 40, february: null, plan: 0 },
                actualIssues: { january: "Historical settlement basis" },
            },
        ];
        const original = structuredClone(rows);
        const displayed = runwayDetailRows(rows);
        expect(displayed.map((row) => row.vendor).sort()).toEqual([
            "Customer payments",
            "Stripe fees",
        ]);
        expect(displayed[0].values.january).toBe(140);
        expect(displayed[0].values.february).toBeNull();
        expect(displayed[0].actualIssues?.january).toBe(
            "Historical settlement basis",
        );
        for (const column of ["january", "plan"])
            expect(
                displayed.reduce(
                    (sum, row) => sum + (row.values[column] ?? 0),
                    0,
                ),
            ).toBe(
                rows.reduce((sum, row) => sum + (row.values[column] ?? 0), 0),
            );
        expect(rows).toEqual(original);
        expect(runwayDetailRows([rows[1]])[0].values).toEqual(rows[1].values);
    });

    it("exposes calendar-month gross and deductions without double-counting cash or forecasts", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));
        const sales: StripeSalesRow[] = [
            {
                month: "2026-09",
                revenue_stream: "pollen",
                currency: "USD",
                gross_sales: 1000,
                refunds: 100,
                reversals: 20,
                stripe_fees: 80,
                dispute_fees: 60,
                net_sales: 880,
                net_after_fees: 800,
                payments: 10,
                refund_count: 1,
                coverage_complete: 1,
            },
            {
                month: "2026-09",
                revenue_stream: "kofi",
                currency: "EUR",
                gross_sales: 100,
                refunds: 10,
                reversals: 5,
                stripe_fees: 5,
                dispute_fees: 2,
                net_sales: 85,
                net_after_fees: 80,
                payments: 2,
                refund_count: 1,
                coverage_complete: 1,
            },
        ];
        const result = buildRunway([], new Date(), [], undefined, sales);
        const actual = result.columns.find(
            (c) => c.month === "2026-09" && c.kind === "actual",
        );
        const forecast = result.columns.find(
            (c) => c.month === "2026-11" && c.kind === "forecast",
        );
        if (!actual || !forecast) throw new Error("Missing runway columns");
        const revenue = result.rows.filter((r) => r.category === "revenue");
        const details = revenue.flatMap((r) => r.details ?? []);
        expect(
            Object.fromEntries(
                details.map((d) => [d.label, d.values[actual.id]]),
            ),
        ).toEqual({
            "Gross customer payments": 1115.13,
            "Stripe fees": -23.4539,
        });
        for (const row of revenue.filter((row) => row.details?.length)) {
            expect(
                row.details?.reduce((sum, d) => sum + d.values[actual.id], 0),
            ).toBeCloseTo(row.values[actual.id] ?? Number.NaN, 8);
            expect(
                row.details?.reduce((sum, d) => sum + d.values[forecast.id], 0),
            ).toBeCloseTo(row.values[forecast.id] ?? Number.NaN, 8);
        }
        expect(
            revenue.reduce(
                (sum, r) => sum + (r.values[actual.id] ?? Number.NaN),
                0,
            ),
        ).toBeCloseTo(892.104, 8);
        expect(
            revenue.reduce(
                (sum, r) => sum + (r.values[forecast.id] ?? Number.NaN),
                0,
            ),
        ).toBeCloseTo(892.104, 8);
        expect(actual.netUsd).toBeNull(); // No Bank coverage in this fixture.
        const html = renderToStaticMarkup(
            createElement(RunwayTab, {
                data: { stripeSales: sales },
                year: "2026",
            }),
        );
        expect(html).toContain("Revenue calculation info");
        expect(html).not.toContain("Plan baseline:");
        expect(html).not.toContain("Provisional runway —");
        expect(html).toMatch(/aria-expanded="false"[^>]*>.*?Cash adjustments/s);
        expect(html).not.toMatch(/<button[^>]*>Cash change<\/button>/);
        const bridgeHtml = renderToStaticMarkup(
            createElement(
                "table",
                {},
                createElement(
                    "tbody",
                    {},
                    createElement(CashAdjustmentRows, {
                        plannedValues: { [forecast.id]: 45 },
                        columns: [
                            {
                                ...actual,
                                cashBridge: {
                                    revenue: 120,
                                    expenses: -50,
                                    receiptsDifference: 30,
                                    paymentsDifference: -10,
                                    otherCash: 5,
                                    exchangeRates: 2,
                                },
                            },
                            forecast,
                        ],
                    }),
                ),
            ),
        );
        expect(bridgeHtml).toContain("Revenue timing &amp; other receipts");
        expect(bridgeHtml).toContain("Expense timing &amp; prepayments");
        expect(bridgeHtml).not.toContain("Revenue after fees");
        expect(bridgeHtml).not.toContain("Cash-funded expenses");
        expect(
            cashAdjustmentValue(
                {
                    ...actual,
                    cashBridge: {
                        revenue: 120,
                        expenses: -50,
                        receiptsDifference: 30,
                        paymentsDifference: -10,
                        otherCash: 5,
                        exchangeRates: 2,
                    },
                },
                999,
            ),
        ).toBe(27);
        expect(cashAdjustmentValue(forecast, 45)).toBe(45);
        expect(
            cashAdjustmentValue({ ...forecast, forecastComplete: false }, 45),
        ).toBeNull();
        expect(
            cashAdjustmentValue({ ...actual, cashBridge: undefined }, 999),
        ).toBeNull();
        expect(bridgeHtml).toContain("Other cash movements");
        expect(bridgeHtml).toContain("Exchange-rate changes");
        expect(html).not.toContain("Revenue · net after deductions");
        expect(html).toContain("Customer payments");
        expect(html).toContain("Stripe fees");
        expect(html).toContain("Refunds, disputes &amp; chargebacks");
        expect(html).not.toContain('aria-label="Refunds calculation info"');
        expect(html).not.toContain(
            'aria-label="Disputes &amp; chargebacks calculation info"',
        );
        const displayed = runwayDetailRows(revenue);
        expect(displayed.map((row) => row.vendor).sort()).toEqual([
            "Customer payments",
            "Refunds, disputes & chargebacks",
            "Stripe fees",
        ]);
        for (const column of result.columns) {
            expect(
                displayed.find(
                    (row) => row.vendor === "Refunds, disputes & chargebacks",
                )?.values[column.id],
            ).toBe(
                revenue.find((row) => row.vendor === "stripe refunds")?.values[
                    column.id
                ],
            );
            expect(
                displayed.reduce(
                    (sum, row) => sum + (row.values[column.id] ?? 0),
                    0,
                ),
            ).toBeCloseTo(
                revenue.reduce(
                    (sum, row) => sum + (row.values[column.id] ?? 0),
                    0,
                ),
                8,
            );
        }
        expect(html).not.toContain("Gross customer payments");
        expect(html).not.toContain("not transfers to Wise");
        expect(html).not.toContain("Stripe sales after fees");
        expect(html).not.toContain("Refunds and reversals");
        const noRefunds = buildRunway(
            [],
            new Date(),
            [],
            {
                "stripe refunds|revenue": {
                    fixedAmounts: [{ amount: 0, currency: "USD" }],
                },
            },
            sales,
        );
        const refundPlan = noRefunds.rows.find(
            (r) => r.vendor === "stripe refunds",
        );
        expect(refundPlan?.values[forecast.id]).toBe(0);
        expect(refundPlan?.details).toBeUndefined();
        expect(refundPlan?.values[actual.id]).toBeCloseTo(-199.5721, 8);
        const invalid = buildRunway([], new Date(), [], undefined, [
            { ...sales[0], net_after_fees: 1 },
        ]);
        expect(invalid.rows.every((row) => !row.details?.length)).toBe(true);
    });

    it("keeps planning notices off the Runway page", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-08-25T12:00:00.000Z"));
        const html = renderToStaticMarkup(
            createElement(RunwayTab, {
                year: "2026",
                data: {
                    vendorLedger: [
                        {
                            entry_id: "google-july-usage",
                            source: "dashboard",
                            vendor: "google",
                            account_id: "default",
                            account_name: "Myceli",
                            type: "inference",
                            start: "2026-07-01 00:00:00",
                            end: "2026-08-01 00:00:00",
                            model: "gemini",
                            paid: -700,
                            credit: 0,
                            currency: "USD",
                            resource_id: "gemini",
                            resource_name: "Provider usage",
                            resource_sku: "tokens",
                            resource_count: 1,
                            evidence: "Provider dashboard",
                            recorded_at: "2026-08-01 00:00:00",
                        },
                    ],
                },
            }),
        );
        expect(html).not.toContain("Needs action");
        expect(html).not.toContain("Expected billing");
        expect(html).not.toContain("planning estimates");
        expect(html).not.toContain("$700 planned settlement");
        expect(html).not.toContain("Checked balance missing for google");
        expect(html).not.toContain("awaiting supplier invoices");
        expect(html).not.toContain("<details open");
    });

    it("shows full rounded runway amounts without compact suffixes", () => {
        expect(fmtRunwayUsd(12_345.67)).toBe("$12,346");
        expect(fmtRunwayUsd(-1_234.56)).toBe("−$1,235");
        expect(fmtRunwayUsd(0)).toBe("$0");
        expect(fmtRunwayUsd(null)).toBe("–");
    });

    it("omits repeated currency symbols inside the runway table", () => {
        expect(fmtRunwayTableValue(12_345.67)).toBe("12,346");
        expect(fmtRunwayTableValue(-1_234.56)).toBe("−1,235");
        expect(fmtRunwayTableValue(0)).toBe("0");
        expect(fmtRunwayTableValue(null)).toBe("–");
    });

    it("uses explicit full month names for the runway horizon", () => {
        expect(runwayMonthLabel("2027-12")).toBe("December 2027");
        expect(
            runwayPeriodText({
                capped: true,
                exhaustedMonth: null,
                lastMonth: "2027-12",
            }),
        ).toBe("December 2027+");
        expect(
            runwayPeriodText({
                capped: false,
                exhaustedMonth: "2027-03",
                lastMonth: "2027-12",
            }),
        ).toBe("March 2027");
    });

    it("uses the same projection rules for labels and calculations", () => {
        for (const vendor of ["fal", "fireworks", "vast"]) {
            expect(automaticForecastRule(vendor, "compute")).toMatchObject({
                method: "last",
                paymentTiming: "prepaid",
            });
        }
        expect(automaticForecastRule("llm7.io", "revenue_share")).toBeNull();
        expect(forecastLineRule("llm7.io", "revenue_share")).toEqual({
            method: "one_off",
            paymentTiming: "direct",
        });
    });

    it("shows D1 balances as non-cashable usage exposure", () => {
        const html = renderToStaticMarkup(
            createElement(RunwayTab, {
                data: {
                    privateConfig: PRIVATE_CONFIG_FIXTURE,
                    userBalances: [
                        {
                            users: 100,
                            paid_users: 10,
                            quest_users: 80,
                            paid_balance: 1_234,
                            quest_balance: 5_678,
                            synced_at: "2026-09-03 03:00:00",
                        },
                    ],
                },
                year: "2026",
            }),
        );

        const cards = html.slice(0, html.indexOf("<table"));
        expect(cards.match(/<\/section>/g)).toHaveLength(3);
        expect(cards).toContain('aria-label="Cash"');
        expect(cards).toContain('aria-label="Outlook"');
        expect(cards).toContain('aria-label="Pollen balance"');
        expect(html).not.toContain("Unspent Pollen");
        expect(cards).toContain("polli:text-paid-deep");
        expect(cards).toContain("polli:text-tier-deep");
        expect(html).toContain("Paid Pollen");
        expect(html).toContain("Quest Pollen");
        expect(html).toContain("1,234");
        expect(html).toContain("5,678");
        expect(html).toContain("full catalog");
        expect(html).toContain("restricted catalog");
        expect(cards).toContain("Snapshot · Sep 3");
        expect(cards).toContain('aria-label="Paid 18% · Quest 82%"');
        expect(cards).toContain(">18%</span>");
        expect(cards).toContain(">82%</span>");
        expect(cards).not.toContain("users ·");
        expect(cards).not.toContain("03:00:00");
    });

    it("colors cash values without overemphasizing zeroes", () => {
        expect(runwayValueClass(10)).toBe("text-outcome-positive-text");
        expect(runwayValueClass(-10)).toBe("text-outcome-negative-text");
        expect(runwayValueClass(0)).toBe("text-theme-text-soft");
        expect(runwayValueClass(null)).toBe("text-theme-text-soft");
    });

    it("shows category totals while vendor detail starts collapsed", () => {
        const data: Data = {
            privateConfig: PRIVATE_CONFIG_FIXTURE,
            opTransactions: [
                {
                    entry_id: "opening",
                    kind: "opening_balance",
                    source: "wise",
                    date: "2026-01-01",
                    vendor: "wise",
                    category: "balance_sheet",
                    amount: 1_000,
                    currency: "USD",
                    description: "Opening balance",
                    evidence: "Statement",
                    recorded_at: "2026-07-02 00:00:00",
                },
                {
                    entry_id: "revenue",
                    kind: "transaction",
                    source: "wise",
                    date: "2026-07-01",
                    vendor: "stripe",
                    category: "revenue",
                    amount: 100,
                    currency: "USD",
                    description: "Revenue",
                    evidence: "",
                    recorded_at: "2026-07-02 00:00:00",
                },
                {
                    entry_id: "expense",
                    kind: "transaction",
                    source: "wise",
                    date: "2026-07-02",
                    vendor: "aws",
                    category: "compute",
                    amount: -40,
                    currency: "USD",
                    description: "Compute",
                    evidence: "",
                    recorded_at: "2026-07-03 00:00:00",
                },
            ],
            stripeSales: [
                {
                    revenue_stream: "pollen",
                    reversals: 0,
                    month: "2026-08",
                    currency: "USD",
                    gross_sales: 120,
                    refunds: 20,
                    net_sales: 100,
                    stripe_fees: 5,
                    dispute_fees: 0,
                    net_after_fees: 95,
                    payments: 3,
                    refund_count: 1,
                },
            ],
        };

        const html = renderToStaticMarkup(
            createElement(RunwayTab, { data, year: "2026" }),
        );
        expect(html).toContain("Revenue");
        expect(html).toContain("Compute");
        expect(html).not.toContain("Revenue · net after deductions");
        const balanceIndex = html.indexOf(
            'aria-label="Cash balance calculation info"',
        );
        const revenueIndex = html.indexOf(
            'aria-label="Revenue calculation info"',
        );
        const expensesIndex = html.indexOf(
            'aria-label="Expenses calculation info"',
        );
        const computeIndex = html.indexOf(
            'aria-label="Compute calculation info"',
        );
        expect(balanceIndex).toBeLessThan(revenueIndex);
        expect(revenueIndex).toBeLessThan(expensesIndex);
        expect(expensesIndex).toBeLessThan(computeIndex);
        expect(html).toContain("runway-subcategory");
        expect(html).not.toContain("<span>mode</span>");
        expect(html).toContain('aria-expanded="false"');
        expect(html).not.toContain(">stripe<");
        expect(html).not.toContain(">aws<");
        expect(html).toContain('aria-label="Expenses calculation info"');
        expect(
            html.match(/aria-label="Cash change calculation info"/g),
        ).toHaveLength(1);
        expect(html).not.toContain("Revenue less expenses");
        expect(html).toContain('aria-label="Cash balance calculation info"');
        expect(html).toContain('aria-label="Revenue calculation info"');
        expect(html).toContain('aria-label="Compute calculation info"');
        expect(html).toContain(
            'aria-label="Customer payments calculation info"',
        );
        expect(html).toContain('class="sr-only">Line item</span>');
        expect(html).not.toContain(">Actual</span>");
        expect(html).toContain(">Plan</span>");
    });

    it("derives the next-month plan without a forecast feed", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-08-25T12:00:00.000Z"));
        const html = renderToStaticMarkup(
            createElement(RunwayTab, {
                year: "2026",
                data: {
                    privateConfig: PRIVATE_CONFIG_FIXTURE,
                    opTransactions: [
                        {
                            entry_id: "opening",
                            kind: "opening_balance",
                            source: "wise",
                            date: "2026-01-01",
                            vendor: "wise",
                            category: "balance_sheet",
                            amount: 1_000,
                            currency: "USD",
                            description: "Opening balance",
                            evidence: "Statement",
                            recorded_at: "2026-08-01 00:00:00",
                        },
                    ],
                },
            }),
        );

        expect(html).toContain("Recorded bank cash");
        expect(html).not.toContain("Cash now");
        expect(html).toContain("Forecast · Aug 31");
        expect(html).toContain("September cash change");
        expect(html).not.toContain("forecast line");
        expect(html).toContain("Recorded · Jan 1");
        expect(html).toContain("Based on bank entries through January 1, 26.");
        expect(html).not.toContain("opening balance missing");
    });
});
