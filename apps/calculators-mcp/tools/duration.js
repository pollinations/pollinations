import { z } from "zod";

// ISO 8601 durations look interchangeable with a number of seconds and are not. A month is
// 28, 29, 30 or 31 days and a year is 365 or 366, so "P1M" has no single second count. This
// tool reports the components and gives totalSeconds only when the duration is unambiguous,
// rather than picking 30 days and quietly being wrong.
const PATTERN =
    /^(-)?P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

const FIXED_SECONDS = {
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60,
};

export const durationTools = [
    [
        "duration_iso",
        'Parse an ISO 8601 duration such as "P1Y2M3W4DT5H6M7S" or "PT0.5S" into its components. Returns years, months, weeks, days, hours, minutes and seconds separately, with a leading - as a flag, and a signed totalSeconds only when the duration contains no years or months. That restriction is the point: a month is 28 to 31 days and a year 365 or 366, so a single second count for them would be an invention. Feed the components to time_math when the duration must land on a calendar.',
        {
            duration: z
                .string()
                .min(2)
                .max(512)
                .describe(
                    'The duration text, such as "P1DT2H30M" or "PT45S". Months must come before the T, hours after it.',
                ),
        },
        ({ duration }) => {
            const match = PATTERN.exec(duration.trim());
            if (!match)
                throw new Error(
                    `${JSON.stringify(duration)} is not an ISO 8601 duration. It starts with P, sets years, months, weeks and days before an optional T, and hours, minutes and seconds after it.`,
                );
            const [
                ,
                sign,
                years = "0",
                months = "0",
                weeks = "0",
                days = "0",
                hours = "0",
                minutes = "0",
                seconds = "0",
            ] = match;
            const parts = {
                years,
                months,
                weeks,
                days,
                hours,
                minutes,
                seconds,
            };
            if (Object.values(parts).every((value) => Number(value) === 0))
                throw new Error(
                    `${JSON.stringify(duration)} has no components. At least one of years, months, weeks, days, hours, minutes or seconds must be present and non-zero.`,
                );

            const numeric = Object.fromEntries(
                Object.entries(parts).map(([key, value]) => [
                    key,
                    Number(value),
                ]),
            );
            const calendarBound = numeric.years > 0 || numeric.months > 0;
            // The sign is folded into the total rather than left to a sibling flag: a caller
            // that reads totalSeconds alone must not get a positive answer for "-PT1H".
            const magnitude =
                numeric.weeks * FIXED_SECONDS.week +
                numeric.days * FIXED_SECONDS.day +
                numeric.hours * FIXED_SECONDS.hour +
                numeric.minutes * FIXED_SECONDS.minute +
                numeric.seconds;
            const totalSeconds = calendarBound
                ? null
                : sign === "-"
                  ? -magnitude
                  : magnitude;

            return {
                negative: sign === "-",
                ...numeric,
                totalSeconds,
            };
        },
    ],
];
