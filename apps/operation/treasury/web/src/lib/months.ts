import type { Data } from "../types";

const MONTH_RE = /^\d{4}-\d{2}$/;
export function monthLabel(month: string): string {
    return month;
}

// filter is "" (everything), "YYYY" (whole year) or "YYYY-MM"; value may be a
// month or a full date. Undated rows stay visible in all/year views, but not
// when drilling into one specific month.
export function matchesMonth(value: string, filter: string): boolean {
    if (!filter) return true;
    if (!value) return filter.length === 4;
    return value.startsWith(filter);
}

// Every month observed across the month-grained tables, sorted ascending.
export function collectMonths(data: Data): string[] {
    const months = new Set<string>();
    for (const row of data.transactions) months.add(row.date.slice(0, 7));
    for (const row of data.meterMonthly) months.add(row.month);
    for (const row of data.usageMonthly) months.add(row.month);
    return [...months]
        .filter((month) => MONTH_RE.test(month))
        .sort((a, b) => a.localeCompare(b));
}

export function yearsOf(months: string[]): string[] {
    return [...new Set(months.map((month) => month.slice(0, 4)))].sort((a, b) =>
        a.localeCompare(b),
    );
}
