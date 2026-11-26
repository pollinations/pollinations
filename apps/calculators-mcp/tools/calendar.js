import { Temporal } from "temporal-polyfill";
import { z } from "zod";

// Weekday/business-day logic on top of Temporal's plain calendar dates:
// no clock, no time zone, no locale.
const DAY_NAMES = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
];

// Zod guarantees the YYYY-MM-DD shape; Temporal rejects impossible days and
// months. overflow:"reject" is required for the object form too, because the
// default silently rolls 2026-02-29 to 2026-02-28.
function plainDate(iso) {
    return Temporal.PlainDate.from(iso, { overflow: "reject" });
}

export const calendarTools = [
    [
        "date_weekday",
        "Weekday of a Gregorian date. Returns the English weekday name, the ISO date and dayOfWeek (1=Monday..7=Sunday, ISO 8601). No clock, locale or time zone involved.",
        {
            date: z
                .string()
                .regex(/^\d{4}-\d{2}-\d{2}$/)
                .describe("Gregorian date, ISO YYYY-MM-DD"),
        },
        ({ date }) => {
            const value = plainDate(date);
            return {
                weekday: DAY_NAMES[value.dayOfWeek - 1],
                iso: value.toString(),
                dayOfWeek: value.dayOfWeek,
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
            const dates = [];
            let date = plainDate(from);
            while (dates.length < days) {
                date = date.add({ days: 1 });
                // PlainDate happily rolls 9999-12-31 into "+010000-01-01";
                // stop before formatting to keep the four-digit contract.
                if (date.year > 9999)
                    throw new Error("business days pass year 9999");
                if (date.dayOfWeek < 6) dates.push(date.toString());
            }
            return { dates };
        },
    ],
];
