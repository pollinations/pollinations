import { describe, expect, it } from "vitest";
import type { StripeSalesRow } from "../types";
import { salesCoverage, salesForecastRows, salesSourceIssues } from "./sales";

const now = new Date("2026-10-16T12:00:00Z");
const row: StripeSalesRow = {
    month: "2026-09",
    currency: "USD",
    revenue_stream: "pollen",
    gross_sales: 100,
    refunds: 0,
    reversals: 0,
    stripe_fees: 3,
    dispute_fees: 0,
    net_sales: 100,
    net_after_fees: 97,
    payments: 1,
    refund_count: 0,
    coverage_complete: 1,
};
describe("financial source reconciliation", () => {
    it("does not treat missing Enter identity as missing sales money", () => {
        const rows = [{ ...row, enter_unmatched_payments: 1 }];
        expect(salesCoverage(rows)).toBe("Complete");
        expect(salesSourceIssues(rows, row.month, now)).toEqual([
            {
                message:
                    "1 recorded Pollen payment(s) have no matching Enter charge event. Financial amounts are included; check Enter event coverage.",
                financial: false,
            },
        ]);
    });
    it("names the missing account and failed import check once across currencies", () => {
        const rows = ["EUR", "USD"].map((currency) => ({
            ...row,
            currency,
            coverage_complete: 0,
            missing_accounts: "acct_missing",
            count_mismatches: 1,
        }));
        const issues = salesSourceIssues(rows, row.month, now);
        expect(issues).toHaveLength(2);
        expect(issues[0].message).toContain("acct_missing");
        expect(issues.every((i) => i.financial)).toBe(true);
    });
    it("accepts fresh partial current-month data, flags stale coverage and keeps absent closed-month data missing", () => {
        const partial = {
            ...row,
            month: "2026-10",
            coverage_complete: 0,
            coverage_end: "2026-10-16 00:00:00.000",
        };
        expect(salesSourceIssues([partial], "2026-10", now)).toEqual([]);
        expect(
            salesSourceIssues(
                [{ ...partial, coverage_end: "2026-10-12 00:00:00.000" }],
                "2026-10",
                now,
            )[0].message,
        ).toContain("two days");
        expect(salesCoverage([])).toBe("Missing");
        expect(
            salesSourceIssues(
                [{ ...partial, coverage_end: undefined }],
                "2026-10",
                now,
            )[0].message,
        ).toContain("boundary is missing");
        expect(salesSourceIssues([], "2026-09", now)[0].financial).toBe(true);
    });
});

it("stops Ko-fi projections without mixing recorded current activity into the plan", () => {
    const kofi = {
        ...row,
        revenue_stream: "kofi" as const,
        gross_sales: 5,
        stripe_fees: 0.7,
        dispute_fees: 0,
    };
    const latest = [row, kofi];
    expect(
        salesForecastRows(latest, "2026-10", now, {
            kofi: "2026-10-16",
        }),
    ).toEqual([row]);
    expect(
        salesForecastRows(latest, "2026-11", now, {
            kofi: "2026-10-16",
        }),
    ).toEqual([row]);
    expect(
        salesForecastRows(latest, "2026-09", new Date("2026-09-15")),
    ).toEqual(latest);
    expect(latest).toEqual([row, kofi]);
});
