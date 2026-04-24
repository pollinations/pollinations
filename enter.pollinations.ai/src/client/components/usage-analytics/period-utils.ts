import type { PeriodGranularity, UsagePeriodSelection } from "./types.ts";

const MS_PER_DAY = 86400000;
export const USAGE_MIN_DATE = "2026-01-01";

export type UsagePeriodWindow = {
    start: Date;
    end: Date;
};

export function startOfUtcDay(date = new Date()): Date {
    return new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
}

export function addUtcDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
}

function startOfUtcMonth(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addUtcMonths(date: Date, months: number): Date {
    return new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1),
    );
}

function startOfUtcIsoWeek(date: Date): Date {
    const day = date.getUTCDay() || 7;
    return addUtcDays(startOfUtcDay(date), 1 - day);
}

function getUtcIsoWeekPeriod(date: Date): string {
    const day = date.getUTCDay() || 7;
    const thursday = addUtcDays(startOfUtcDay(date), 4 - day);
    const isoYear = thursday.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const isoWeek = Math.ceil(
        ((thursday.getTime() - yearStart.getTime()) / MS_PER_DAY + 1) / 7,
    );
    return `${isoYear}-W${String(isoWeek).padStart(2, "0")}`;
}

function formatUtcDatePeriod(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function formatUtcHourPeriod(date: Date): string {
    return date.toISOString().slice(0, 13).replace("T", " ");
}

function formatUtcMonthPeriod(date: Date): string {
    return date.toISOString().slice(0, 7);
}

export function periodFromDate(
    granularity: PeriodGranularity,
    date = new Date(),
): UsagePeriodSelection {
    if (granularity === "day") {
        return {
            granularity,
            period: formatUtcDatePeriod(startOfUtcDay(date)),
        };
    }
    if (granularity === "week") {
        return { granularity, period: getUtcIsoWeekPeriod(date) };
    }
    return { granularity, period: formatUtcMonthPeriod(startOfUtcMonth(date)) };
}

export function currentUsagePeriod(): UsagePeriodSelection {
    return periodFromDate("day");
}

export function usageMinDate(): Date {
    return new Date(`${USAGE_MIN_DATE}T00:00:00.000Z`);
}

export function periodToWindow(
    selection: UsagePeriodSelection,
): UsagePeriodWindow {
    if (selection.granularity === "day") {
        const start = new Date(`${selection.period}T00:00:00.000Z`);
        return { start, end: addUtcDays(start, 1) };
    }

    if (selection.granularity === "week") {
        const [yearText, weekText] = selection.period.split("-W");
        const isoYear = Number(yearText);
        const isoWeek = Number(weekText);
        const jan4 = new Date(Date.UTC(isoYear, 0, 4));
        const start = addUtcDays(startOfUtcIsoWeek(jan4), (isoWeek - 1) * 7);
        return { start, end: addUtcDays(start, 7) };
    }

    const [yearText, monthText] = selection.period.split("-");
    const start = new Date(
        Date.UTC(Number(yearText), Number(monthText) - 1, 1),
    );
    return { start, end: addUtcMonths(start, 1) };
}

export function formatPeriodLabel(selection: UsagePeriodSelection): string {
    const { start, end } = periodToWindow(selection);

    if (selection.granularity === "day") {
        const today = startOfUtcDay();
        const yesterday = addUtcDays(today, -1);
        if (start.getTime() === today.getTime()) return "Today";
        if (start.getTime() === yesterday.getTime()) return "Yesterday";
        return start.toLocaleDateString("en-US", {
            timeZone: "UTC",
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    }

    if (selection.granularity === "week") {
        const weekEnd = addUtcDays(end, -1);
        return `${start.toLocaleDateString("en-US", {
            timeZone: "UTC",
            month: "short",
            day: "numeric",
        })} - ${weekEnd.toLocaleDateString("en-US", {
            timeZone: "UTC",
            month: "short",
            day: "numeric",
            year: "numeric",
        })}`;
    }

    return start.toLocaleDateString("en-US", {
        timeZone: "UTC",
        month: "long",
        year: "numeric",
    });
}

export function getPeriodDates(selection: UsagePeriodSelection): string[] {
    const { start, end } = periodToWindow(selection);
    const dates: string[] = [];
    const cursor = new Date(start);
    if (selection.granularity === "day") {
        while (cursor < end) {
            dates.push(`${formatUtcHourPeriod(cursor)}:00:00`);
            cursor.setUTCHours(cursor.getUTCHours() + 1);
        }
        return dates;
    }

    while (cursor < end) {
        dates.push(formatUtcDatePeriod(cursor));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return dates;
}

export function isUsagePeriodSelectable(
    selection: UsagePeriodSelection,
): boolean {
    const { start, end } = periodToWindow(selection);
    const today = startOfUtcDay();
    return end > usageMinDate() && start <= today;
}
