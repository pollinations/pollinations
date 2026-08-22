import type { Data } from "../types";
import { fmtMonthYear } from "./format";

const MONTH_RE = /^\d{4}-\d{2}$/;

export type MonthFilterValue = string | readonly string[];
export type ValueFilter = string | readonly string[];

export function monthLabel(month: string): string {
    if (!MONTH_RE.test(month)) return month;
    return fmtMonthYear(month.slice(0, 4), month.slice(5, 7));
}

// filter is "" (everything), "YYYY" (whole year) or "YYYY-MM"; value may be a
// month or a full date. Undated rows stay visible in all/year views, but not
// when drilling into one specific month.
export function matchesMonth(value: string, filter: MonthFilterValue): boolean {
    if (typeof filter !== "string") {
        return (
            filter.length === 0 ||
            filter.some((item) => matchesMonth(value, item))
        );
    }
    if (!filter) return true;
    if (!value) return filter.length === 4;
    return value.startsWith(filter);
}

export function matchesValue(value: string, filter: ValueFilter): boolean {
    if (typeof filter !== "string") {
        return filter.length === 0 || filter.includes(value);
    }
    return filter === "" || filter === "all" || value === filter;
}

// The analysis window starts 2026-01 (the December hard rule).
// provider_monthly also holds pre-window credit rows (2025 usage recorded
// solely for grant-burn accounting) — every month-grained lens except the
// Credits runway must clamp to the window.
export const WINDOW_START = "2026-01";

// Every in-window month observed across the OP month-grained tables, ascending.
export function collectMonths(data: Data): string[] {
    const months = new Set<string>();
    for (const row of data.opTransactions ?? [])
        months.add(row.date.slice(0, 7));
    for (const row of data.opCloud ?? []) months.add(row.start.slice(0, 7));
    for (const row of data.opPollen ?? []) months.add(row.month);
    return [...months]
        .filter((month) => MONTH_RE.test(month) && month >= WINDOW_START)
        .sort((a, b) => a.localeCompare(b));
}

// Prefer the latest closed month so live month-to-date Pollen rows do not make
// the dashboard open on a deliberately incomplete reconciliation period.
export function latestClosedMonth(
    months: string[],
    now = new Date(),
): string | null {
    if (months.length === 0) return null;
    const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    for (let index = months.length - 1; index >= 0; index -= 1) {
        if (months[index] < currentMonth) return months[index];
    }
    return months.at(-1) ?? null;
}

export function yearsOf(months: string[]): string[] {
    return [...new Set(months.map((month) => month.slice(0, 4)))].sort((a, b) =>
        a.localeCompare(b),
    );
}
