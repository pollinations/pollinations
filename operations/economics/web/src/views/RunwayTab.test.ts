import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PRIVATE_CONFIG_FIXTURE } from "../fixtures";
import { automaticForecastRule, forecastLineRule } from "../lib/forecastTerms";
import { buildRunway } from "../lib/runway";
import type { Data, StripeSalesRow } from "../types";
import {
    fmtRunwayTableValue,
    fmtRunwayUsd,
    RunwayTab,
    runwayMonthLabel,
    runwayPeriodText,
    runwayValueClass,
} from "./RunwayTab";

afterEach(() => {
    vi.useRealTimers();
});

describe("RunwayTab labels", () => {
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
            "Stripe fees (including dispute fees)": -85.7565,
            Refunds: -111.513,
            "Chargebacks / other reversals": -25.7565,
        });
        for (const row of revenue) {
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
        expect(html).not.toContain("Revenue · net after deductions");
        for (const detail of details) expect(html).toContain(detail.label);
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
        expect(
            refundPlan?.details?.every((d) => d.values[forecast.id] === 0),
        ).toBe(true);
        expect(refundPlan?.values[actual.id]).toBeCloseTo(-137.2695, 8);
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
        expect(cards).toContain('aria-label="Paid 17.85% · Quest 82.15%"');
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
            'aria-label="Gross customer payments calculation info"',
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
