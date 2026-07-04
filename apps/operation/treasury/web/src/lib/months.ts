import type { Data } from "../types";

const MONTH_RE = /^\d{4}-\d{2}$/;
const MONTH_NAMES = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
];
const MONTH_FULL_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

export function monthLabel(month: string): string {
    if (!MONTH_RE.test(month)) return month;
    const index = Number(month.slice(5, 7)) - 1;
    return MONTH_NAMES[index] ?? month;
}

export function monthName(month: string): string {
    if (!MONTH_RE.test(month)) return month;
    const index = Number(month.slice(5, 7)) - 1;
    return MONTH_FULL_NAMES[index] ?? month;
}

// filter is "" (everything), "YYYY" (whole year) or "YYYY-MM"; value may be a
// month or a full date. A row without a date can never be excluded by a month
// filter — undated invoices must stay visible until they get labeled.
export function matchesMonth(value: string, filter: string): boolean {
    if (!filter || !value) return true;
    return value.startsWith(filter);
}

// Every month observed across the month-grained tables, sorted ascending.
export function collectMonths(data: Data): string[] {
    const months = new Set<string>();
    for (const row of data.coverage) months.add(row.month);
    for (const row of data.invoices) months.add(row.period_month);
    for (const row of data.paymentsTx) months.add(row.paid_at.slice(0, 7));
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

export function lastCompleteMonth(now: Date = new Date()): string {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const mm = String(prev.getMonth() + 1).padStart(2, "0");
    return `${prev.getFullYear()}-${mm}`;
}

// Page-load default: the last complete month, falling back to the latest
// month that actually has data.
export function defaultMonth(months: string[], now?: Date): string {
    if (months.length === 0) return "";
    const target = lastCompleteMonth(now);
    return months.includes(target) ? target : months[months.length - 1];
}
