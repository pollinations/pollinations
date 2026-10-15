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
    for (const chart of [
        "Monthly result",
        "Expenses before credits",
        "Cost funding",
    ]) {
        expect(html).toContain(`aria-label="${chart} scope"`);
    }
    expect(html.match(/aria-label="[^"]+ scope"/g)).toHaveLength(3);
    expect(html).not.toContain("Company performance");
    expect(html.match(/<svg[^>]+aria-label=/g)).toHaveLength(6);
    expect(html).not.toContain("Monthly details");
    expect(html).not.toContain("Provider credit dates &amp; limits");
    expect(html).toContain("Pollen consumed. Pollen by month");
    expect(html).toContain("Quest serving costs");
    expect(html).not.toContain('aria-label="Trends focus"');
    expect(html).not.toContain("No wallet snapshot");
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
    expect(html).not.toContain("Expense categories");
    expect(html).toContain('aria-label="Toggle Compute"');
    expect(html).toContain('aria-label="Toggle Revenue Share"');
    expect(html).toContain('aria-label="Toggle Payroll"');
    expect(html.match(/aria-label="Toggle [^"]+"/g)).toHaveLength(8);
    expect(html).toContain("Product");
    expect(
        /<button[^>]*aria-pressed="true"[^>]*>Whole company<\/button>/.test(
            html,
        ),
    ).toBe(true);
    expect(html).toContain("Sales. USD by month");
    expect(html).toContain("Customer payments");
    expect(html).toContain("After deductions");
    expect(html).not.toContain("API + GPU margin");
    expect(html).toContain("Expenses before credits");
    expect(html).toContain("Infrastructure");
    expect(html).toContain('aria-label="Toggle Development"');
    expect(html).toContain('aria-label="Whole company"');
    expect(html).not.toContain("Overhead");
    expect(html).not.toContain("September · USD");
    expect(html).toContain("vs August");
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

it("omits current balances while retaining monthly Pollen activity", () => {
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
    expect(html).not.toContain("Latest recorded balances");
    expect(html).not.toContain("Recorded provider credits");
    expect(html).not.toContain("Unspent Paid Pollen");
    expect(html).not.toContain("Unspent Quest Pollen");
    expect(html).not.toContain("1,234");
    expect(html).not.toContain("4,567");
    expect(html).toContain("Pollen consumed");
    expect(html).toContain("Quest serving costs");
});

it("keeps monthly actual and fraud-adjusted results within the selected period", () => {
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
        opTransactions: months.map((month) => ({
            entry_id: `payroll-${month}`,
            kind: "transaction",
            source: "wise",
            date: `${month}-28`,
            vendor: "deel",
            category: "payroll",
            amount: -400,
            currency: "USD",
            description: "Salary",
            evidence: "Statement",
            recorded_at: "2026-10-15 00:00:00",
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
    expect(html).toContain("July 26 – September 26");
    expect(html).not.toContain("Period results comparison");
    expect(html).toContain("With credits");
    expect(html).toContain("Without credits");
    expect(html).toContain("$3,000");
    expect(html).toContain("$2,900");
    expect(html).toContain("$2,400");
    expect(html).toContain("$2,350");
    expect(html).toContain("$2,480");
    expect(html).toContain("$2,430");
    expect(html).toContain("excluding fraud");
    expect(html).toContain("+71.4%");
    expect(html).toContain("text-outcome-positive-text");
    expect(html).not.toContain("April");
    expect(
        /<button[^>]*aria-pressed="true"[^>]*>3 months<\/button>/.test(html),
    ).toBe(true);
    const longer = render(6);
    expect(longer).toContain("April 26 – September 26");
    expect(longer).toContain("$2,400");
    expect(longer).toContain("$2,480");
    expect(longer).not.toContain("NaN");
});
