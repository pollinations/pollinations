import { describe, expect, it } from "vitest";
import { FIXTURES } from "../fixtures";
import type { Data } from "../types";
import { collectMonths, matchesMonth, monthLabel, yearsOf } from "./months";

const data: Data = {
    transactions: FIXTURES.transactions_api,
    meterMonthly: FIXTURES.meter_monthly_api,
    usageMonthly: FIXTURES.usage_monthly_api,
    runs: FIXTURES.ingest_runs_api,
    revenueMonthly: FIXTURES.revenue_monthly_api,
} as Data;

describe("collectMonths", () => {
    it("unions months across all month-grained tables, sorted", () => {
        const months = collectMonths(data);
        expect(months).toEqual([...months].sort());
        expect(new Set(months).size).toBe(months.length);
        expect(months).toContain("2026-05");
    });

    it("skips empty and non-month values (undated invoices)", () => {
        const months = collectMonths(data);
        expect(months.every((m) => /^\d{4}-\d{2}$/.test(m))).toBe(true);
    });
});

describe("matchesMonth", () => {
    it("empty filter matches everything", () => {
        expect(matchesMonth("2026-03", "")).toBe(true);
    });

    it("year filter matches by prefix", () => {
        expect(matchesMonth("2026-03", "2026")).toBe(true);
        expect(matchesMonth("2025-12", "2026")).toBe(false);
    });

    it("month filter matches exactly, including full dates", () => {
        expect(matchesMonth("2026-03", "2026-03")).toBe(true);
        expect(matchesMonth("2026-03-14", "2026-03")).toBe(true);
        expect(matchesMonth("2026-04", "2026-03")).toBe(false);
    });

    it("undated rows stay visible in year views", () => {
        expect(matchesMonth("", "2026")).toBe(true);
    });

    it("undated rows are excluded from month drilldowns", () => {
        expect(matchesMonth("", "2026-03")).toBe(false);
    });
});

describe("monthLabel", () => {
    it("returns raw month values", () => {
        expect(monthLabel("2006-06")).toBe("2006-06");
        expect(monthLabel("2026-06")).toBe("2026-06");
        expect(monthLabel("2026-07")).toBe("2026-07");
    });

    it("returns raw non-month values", () => {
        expect(monthLabel("2026")).toBe("2026");
        expect(monthLabel("")).toBe("");
    });
});

describe("yearsOf", () => {
    it("derives unique years from months", () => {
        expect(yearsOf(["2026-01", "2026-07", "2027-01"])).toEqual([
            "2026",
            "2027",
        ]);
    });
});
