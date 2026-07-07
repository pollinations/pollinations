import { describe, expect, it } from "vitest";
import { FIXTURES } from "../fixtures";
import type { Data } from "../types";
import {
    collectMonths,
    isYearFilter,
    matchesMonth,
    monthLabel,
    yearsOf,
} from "./months";

const data: Data = {
    transactions: FIXTURES.transactions_api,
    providerMonthly: FIXTURES.provider_monthly_api,
    pollenMonthly: FIXTURES.pollen_monthly_api,
    grants: FIXTURES.grants_api,
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

describe("isYearFilter", () => {
    it("only accepts bare four-digit years", () => {
        expect(isYearFilter("2026")).toBe(true);
        expect(isYearFilter("2026-07")).toBe(false);
        expect(isYearFilter("")).toBe(false);
    });
});

describe("monthLabel", () => {
    it("renders full month names with two-digit years", () => {
        expect(monthLabel("2006-06")).toBe("June 06");
        expect(monthLabel("2026-06")).toBe("June 26");
        expect(monthLabel("2026-07")).toBe("July 26");
    });

    it("falls back to the raw value when not a month", () => {
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
