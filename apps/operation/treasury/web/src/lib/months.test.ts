import { describe, expect, it } from "vitest";
import { FIXTURES } from "../fixtures";
import type { Data } from "../types";
import {
    collectMonths,
    defaultMonth,
    lastCompleteMonth,
    matchesMonth,
    monthLabel,
    monthName,
    yearsOf,
} from "./months";

const data: Data = {
    coverage: FIXTURES.coverage_ep,
    gaps: FIXTURES.gaps_ep,
    invoices: FIXTURES.invoices_ep,
    paymentsTx: FIXTURES.payments_ep,
    meterMonthly: FIXTURES.meter_monthly_ep,
    usageMonthly: FIXTURES.usage_ep,
    runs: FIXTURES.runs_ep,
    revenueMonthly: FIXTURES.revenue_ep,
} as Data;

describe("collectMonths", () => {
    it("unions months across all five month-grained tables, sorted", () => {
        const months = collectMonths(data);
        expect(months).toEqual([...months].sort());
        expect(new Set(months).size).toBe(months.length);
        // coverage carries 2026-01..03, payments/meter/usage carry 05..07
        expect(months).toContain("2026-01");
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

    it("undated rows are never excluded", () => {
        expect(matchesMonth("", "2026-03")).toBe(true);
    });
});

describe("monthLabel", () => {
    it("renders short month names", () => {
        expect(monthLabel("2026-01")).toBe("Jan");
        expect(monthLabel("2026-12")).toBe("Dec");
    });

    it("falls back to the raw value when not a month", () => {
        expect(monthLabel("2026")).toBe("2026");
        expect(monthLabel("")).toBe("");
    });
});

describe("monthName", () => {
    it("renders full month names", () => {
        expect(monthName("2026-01")).toBe("January");
        expect(monthName("2026-12")).toBe("December");
    });

    it("falls back to the raw value when not a month", () => {
        expect(monthName("2026")).toBe("2026");
        expect(monthName("")).toBe("");
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

describe("lastCompleteMonth", () => {
    it("returns the previous month", () => {
        expect(lastCompleteMonth(new Date(2026, 6, 3))).toBe("2026-06");
    });

    it("rolls over the year in January", () => {
        expect(lastCompleteMonth(new Date(2026, 0, 15))).toBe("2025-12");
    });
});

describe("defaultMonth", () => {
    const now = new Date(2026, 6, 3);

    it("picks the last complete month when it has data", () => {
        expect(defaultMonth(["2026-05", "2026-06", "2026-07"], now)).toBe(
            "2026-06",
        );
    });

    it("falls back to the latest month with data", () => {
        expect(defaultMonth(["2026-01", "2026-03"], now)).toBe("2026-03");
    });

    it("returns all when no months exist", () => {
        expect(defaultMonth([], now)).toBe("");
    });
});
