import { z } from "zod";

// Weekday/business-day logic ported from an internal Python MCP to integers.
// Zeller's congruence only: no Date, no time zone, no locale.
const DAY_NAMES = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
];
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeap(year) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year, month) {
    return month === 2 && isLeap(year) ? 29 : MONTH_DAYS[month - 1];
}

// Zeller yields 0=Saturday..6=Friday; shift to 0=Monday..6=Sunday.
function weekdayIndex(year, month, day) {
    const y = month < 3 ? year - 1 : year;
    const m = month < 3 ? month + 12 : month;
    const k = y % 100;
    const j = Math.floor(y / 100);
    const zeller =
        (day +
            Math.floor((13 * (m + 1)) / 5) +
            k +
            Math.floor(k / 4) +
            Math.floor(j / 4) +
            5 * j) %
        7;
    return (zeller + 5) % 7;
}

function isoDate(year, month, day) {
    return [
        String(year).padStart(4, "0"),
        String(month).padStart(2, "0"),
        String(day).padStart(2, "0"),
    ].join("-");
}

// Zeller is only valid for the Gregorian calendar.
function assertDate(year, month, day) {
    if (year < 1583 || year > 9999)
        throw new Error(`year must be 1583-9999, got ${year}`);
    if (month < 1 || month > 12)
        throw new Error(`month must be 1-12, got ${month}`);
    const limit = daysInMonth(year, month);
    if (day < 1 || day > limit)
        throw new Error(
            `${isoDate(year, month, day)} does not exist: month ${month} of ${year} has ${limit} days`,
        );
}

function nextDay(year, month, day) {
    if (day < daysInMonth(year, month)) return [year, month, day + 1];
    if (month < 12) return [year, month + 1, 1];
    return [year + 1, 1, 1];
}

export const calendarTools = [
    [
        "date_weekday",
        "Weekday of a Gregorian date, computed with Zeller's congruence over integers. Returns the English weekday name, the ISO date and dayOfWeek (0=Monday..6=Sunday). No clock, locale or time zone involved.",
        {
            year: z
                .number()
                .int()
                .min(1583)
                .max(9999)
                .describe("Gregorian year"),
            month: z.number().int().min(1).max(12).describe("Month, 1-12"),
            day: z.number().int().min(1).max(31).describe("Day of month"),
        },
        ({ year, month, day }) => {
            assertDate(year, month, day);
            const dayOfWeek = weekdayIndex(year, month, day);
            return {
                weekday: DAY_NAMES[dayOfWeek],
                iso: isoDate(year, month, day),
                dayOfWeek,
            };
        },
    ],
    [
        "add_business_days",
        "The next N Monday-Friday dates after an ISO date, starting the day after it. Weekends are skipped; public holidays are not modelled. Fails if the range would pass year 9999.",
        {
            from: z
                .string()
                .regex(/^\d{4}-\d{2}-\d{2}$/)
                .describe(
                    "Start date, ISO YYYY-MM-DD; it is excluded from the result",
                ),
            days: z
                .number()
                .int()
                .min(1)
                .max(100)
                .describe("How many business days to return"),
        },
        ({ from, days }) => {
            let [year, month, day] = from.split("-").map(Number);
            assertDate(year, month, day);
            const dates = [];
            while (dates.length < days) {
                [year, month, day] = nextDay(year, month, day);
                if (year > 9999)
                    throw new Error("business days pass year 9999");
                if (weekdayIndex(year, month, day) < 5)
                    dates.push(isoDate(year, month, day));
            }
            return { dates };
        },
    ],
];
