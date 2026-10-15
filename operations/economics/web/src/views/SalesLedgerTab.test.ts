import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { StripeSalesRow } from "../types";
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
        "Complete",
    ])
        expect(html).toContain(value);
    expect(html).not.toContain("99,999");
    expect(html).toContain('aria-sort="none"');
});
it("shows unverified month coverage consistently across currencies and keeps the current month open", () => {
    const html = render([
        row,
        { ...row, currency: "EUR", coverage_complete: undefined },
    ]);
    expect(html.match(/>Unverified</g)).toHaveLength(2);
    expect(html).not.toContain(">Complete<");
    expect(
        render([{ ...row, month: "2026-10", coverage_complete: 0 }], "2026-10"),
    ).toContain("In progress");
});
it("keeps missing data distinct from confirmed zero sales", () => {
    const html = render([]);
    expect(html).toContain("No sales data recorded");
    expect(html).not.toContain("0.00");
    expect(html).not.toContain(">Complete<");
    expect(render([], "2026-10")).toContain("month in progress");
});
