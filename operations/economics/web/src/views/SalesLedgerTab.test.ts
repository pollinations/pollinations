import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { Data, StripeSalesRow } from "../types";
import { SalesLedgerTab } from "./SalesLedgerTab";

const row: StripeSalesRow = {
    month: "2026-09",
    revenue_stream: "pollen",
    currency: "USD",
    gross_sales: 13232.82,
    refunds: 1749.02,
    reversals: 282.12,
    stripe_fees: 3341.43,
    net_sales: 11201.68,
    net_after_fees: 7860.25,
    payments: 1082,
    refund_count: 466,
    coverage_complete: 1,
};
const now = new Date("2026-10-15T12:00:00Z");
const render = (rows: StripeSalesRow[], month = "2026-09") =>
    renderToStaticMarkup(
        createElement(SalesLedgerTab, {
            data: { stripeSales: rows },
            month,
            now,
        }),
    );
it("shows exact native-currency Stripe facts, streams and deductions for the selected month", () => {
    const html = render([
        row,
        { ...row, revenue_stream: "kofi", currency: "EUR", gross_sales: 5 },
        { ...row, month: "2026-08", gross_sales: 99999 },
    ]);
    for (const value of [
        "Pollen",
        "Ko-fi",
        "EUR",
        "USD",
        "13,232.82",
        "1,749.02",
        "282.12",
        "3,341.43",
        "7,860.25",
    ])
        expect(html).toContain(value);
    expect(html).not.toContain("99,999");
    expect(html).toContain('aria-sort="none"');
});
it("keeps coverage diagnostics in reconciliation while retaining sales facts", () => {
    const html = render([
        row,
        { ...row, currency: "EUR", coverage_complete: undefined },
    ]);
    expect(html).not.toContain("Unverified");
    expect(html).not.toContain("Month coverage");
    expect(html).toContain("13,232.82");
    expect(html).not.toContain(">Complete<");
    expect(
        render([{ ...row, month: "2026-10", coverage_complete: 0 }], "2026-10"),
    ).not.toContain("In progress");
});
it("keeps missing data distinct from confirmed zero sales", () => {
    const html = render([]);
    expect(html).toContain("No sales data recorded");
    expect(html).not.toContain(">0<");
    expect(html).not.toContain(">Complete<");
    expect(render([], "2026-10")).toContain("month in progress");
});

it("shows the reviewed fraud breakdown alongside unchanged sales facts", () => {
    const data: Data = {
        stripeSales: [{ ...row }],
        privateConfig: {
            forecastRules: {},
            reviewNotes: {
                providerCheckExplanations: [],
                meterDriftExplanations: [],
                pollenWitnessExplanations: [],
            },
        },
    };
    if (!data.stripeSales) throw new Error("Missing fixture");
    Object.assign(data.stripeSales[0], {
        fraud_refunds: 10,
        fraud_reversals: 5,
        fraud_fees: 20,
        fraud_transactions: 1,
        fraud_evidence: ["https://drive.google.com/file/d/source/view"],
    });
    const html = renderToStaticMarkup(
        createElement(SalesLedgerTab, { data, now }),
    );
    expect(html).toContain("Identified fraud costs");
    expect(html).toContain(">35<");
    expect(html).toContain("Dispute fees: ");
    expect(html.replace(/<[^>]+>/g, "")).toContain("Dispute fees: 20");
    expect(html).toContain("7,860.25");
    expect(html).toContain("https://drive.google.com/file/d/source/preview");
});
