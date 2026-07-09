import type { Data } from "../types";
import { fmtMonthYear } from "./format";

const MONTH_RE = /^\d{4}-\d{2}$/;
const YEAR_RE = /^\d{4}$/;

export function isYearFilter(value: string): boolean {
    return YEAR_RE.test(value);
}

export function monthLabel(month: string): string {
    if (!MONTH_RE.test(month)) return month;
    return fmtMonthYear(month.slice(0, 4), month.slice(5, 7));
}

// filter is "" (everything), "YYYY" (whole year) or "YYYY-MM"; value may be a
// month or a full date. Undated rows stay visible in all/year views, but not
// when drilling into one specific month.
export function matchesMonth(value: string, filter: string): boolean {
    if (!filter) return true;
    if (!value) return filter.length === 4;
    return value.startsWith(filter);
}

// The reconciliation window starts 2026-01 (the December hard rule).
// provider_monthly also holds pre-window credit rows (2025 usage recorded
// solely for grant-burn accounting) — every month-grained lens except the
// Credits runway must clamp to the window.
export const WINDOW_START = "2026-01";

// Every in-window month observed across the month-grained tables, ascending.
export function collectMonths(data: Data): string[] {
    const months = new Set<string>();
    for (const row of data.transactions) months.add(row.date.slice(0, 7));
    for (const row of data.providerMonthly) months.add(row.month);
    for (const row of data.pollenMonthly) months.add(row.month);
    for (const row of data.opTransactions ?? [])
        months.add(row.date.slice(0, 7));
    for (const row of data.opCloud ?? []) months.add(row.start.slice(0, 7));
    for (const row of data.opPollen ?? []) months.add(row.month);
    return [...months]
        .filter((month) => MONTH_RE.test(month) && month >= WINDOW_START)
        .sort((a, b) => a.localeCompare(b));
}

export function yearsOf(months: string[]): string[] {
    return [...new Set(months.map((month) => month.slice(0, 4)))].sort((a, b) =>
        a.localeCompare(b),
    );
}

export function lastFullMonth(now: Date = new Date()): string {
    const year = now.getUTCFullYear();
    const monthIndex = now.getUTCMonth();
    const last = new Date(Date.UTC(year, monthIndex - 1, 1));
    return `${last.getUTCFullYear()}-${String(last.getUTCMonth() + 1).padStart(2, "0")}`;
}
