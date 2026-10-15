import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import type { Data } from "../types";
import { TrendsTab } from "./TrendsTab";

afterEach(() => vi.useRealTimers());
it("renders charts and unknown values without repeating the reconciliation messages", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));
    const html = renderToStaticMarkup(
        createElement(TrendsTab, {
            data: {},
            period: 6,
            onPeriodChange: () => {},
        }),
    );
    expect(html).not.toContain("Stripe sales missing");
    expect(html).not.toContain("API costs missing");
    expect(html).toContain("September");
    expect(html).not.toContain("gaps mean missing data");
    expect(html).not.toContain("September*");
    expect(html).not.toContain('aria-label="Cost scope"');
    expect(html).toContain("Company performance");
    expect(html.match(/<svg[^>]+aria-label=/g)).toHaveLength(5);
    expect(html).not.toContain("Monthly details");
    expect(html).not.toContain("Provider credit dates &amp; limits");
    expect(html).toContain("Paid &amp; Quest activity");
    expect(html).toContain("Pollen consumed. Pollen by month");
    expect(html).toContain("Quest serving costs");
    expect(html).not.toContain('aria-label="Trends focus"');
    expect(html).toContain("No wallet snapshot");
    expect(html).not.toContain("Not measured yet");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("January");
    expect(html).toContain("April");
    expect(html).not.toContain("October");
    expect(html).not.toContain("2025");
    expect(html).not.toContain("month filter");
    expect(html).not.toContain('aria-label="year filter"');
    expect(html).toContain('aria-label="Chart period"');
    expect(
        /<button[^>]*aria-pressed="true"[^>]*>6 months<\/button>/.test(html),
    ).toBe(true);
    expect(html).toContain(">12 months</button>");
    expect(html).not.toContain("Recent 6 months");
    expect(html).not.toContain("Full year");
    expect(html).not.toContain("<select");
    expect(html).toContain("API + GPU margin");
    expect(html).toContain("Expenses before credits");
    expect(html).toContain("Infrastructure");
    expect(html).toContain("Development");
    expect(html).not.toContain("Other operations");
});

it("shows only available 2026 history in the twelve-month view", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
    const html = renderToStaticMarkup(
        createElement(TrendsTab, {
            data: {},
            period: 12,
            onPeriodChange: () => {},
        }),
    );
    expect(html).toContain("January");
    expect(html).toContain("September");
    expect(html).not.toContain("October");
    expect(html).not.toContain("2025");
});

it("keeps wallet snapshots separate from monthly flows and does not invent a provider balance", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
    const html = renderToStaticMarkup(
        createElement(TrendsTab, {
            data: {
                userBalances: [
                    {
                        users: 10,
                        paid_users: 3,
                        quest_users: 9,
                        paid_balance: 1234,
                        quest_balance: 4567,
                        synced_at: "2026-10-05 03:26:38",
                    },
                ],
            },
            period: 6,
            onPeriodChange: () => {},
        }),
    );
    expect(html).toContain("Pollen · snapshot October 5, 26");
    expect(html).toContain("1,234");
    expect(html).toContain("4,567");
    expect(html).not.toContain("$1,234");
    expect(html).not.toContain("$4,567");
    const creditCard = html
        .split("Recorded provider credits")[1]
        .split("Separate provider pools")[0];
    expect(creditCard).toContain("–");
    expect(creditCard).not.toContain("$0");
});

it("summarizes the full selected period and keeps missing months unknown", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
    const months = ["2026-07", "2026-08", "2026-09"];
    const data: Data = {
        stripeSales: months.map((month, i) => ({
            month,
            revenue_stream: "pollen",
            currency: "USD",
            coverage_complete: 1,
            gross_sales: (i + 1) * 1000,
            refunds: 100,
            reversals: 0,
            stripe_fees: 0,
            net_sales: (i + 1) * 1000 - 100,
            net_after_fees: (i + 1) * 1000 - 100,
            payments: 10,
            refund_count: 1,
        })),
        vendorLedger: months.map((month) => ({
            entry_id: `cost-${month}`,
            source: "dashboard",
            vendor: "google",
            type: "inference",
            start: `${month}-01`,
            end: `${month}-30`,
            paid: -100,
            credit: -50,
            currency: "USD",
            resource_id: "usage",
            resource_name: "Usage",
            resource_sku: "tokens",
            resource_count: 1,
            model: "gemini",
            evidence: "Statement",
            recorded_at: "2026-10-15 00:00:00",
        })),
        privateConfig: {
            forecastRules: {},
            reconciliation: {
                providerCheckExplanations: [],
                meterDriftExplanations: [],
                pollenWitnessExplanations: [],
            },
            salesAdjustments: [
                {
                    month: "2026-09",
                    revenue_stream: "pollen",
                    currency: "USD",
                    refunds: 80,
                    reversals: 0,
                    stripe_fees: 0,
                    evidence: ["https://drive.google.com/file/d/review/view"],
                },
            ],
        },
    };
    const render = (period: 3 | 6) =>
        renderToStaticMarkup(
            createElement(TrendsTab, {
                data,
                period,
                onPeriodChange: () => {},
            }),
        );
    const html = render(3);
    const cards = html
        .split("Company performance")[1]
        .split("Monthly result")[0];
    expect(cards).toContain("Period totals · July 26 – September 26");
    expect(cards.match(/>\$5,400</g)).toHaveLength(2);
    expect(cards).toContain("$5,250");
    expect(cards).toContain("$5,480");
    expect(cards).toContain("$80 excluded");
    expect(cards).not.toContain("August:");
    expect(html).not.toContain("April");
    expect(
        /<button[^>]*aria-pressed="true"[^>]*>3 months<\/button>/.test(html),
    ).toBe(true);
    const incomplete = render(6)
        .split("Company performance")[1]
        .split("Monthly result")[0];
    expect(incomplete).toContain("–");
    expect(incomplete).not.toContain("$5,400");
    expect(incomplete).not.toContain("$5,480");
});
