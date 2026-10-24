import { Cron } from "croner";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";

// Time tool design: Marcus-Mok-GH (#17857); cron evaluation: ismailbanouigu (#17975).
const timestamp = z
    .string()
    .min(1)
    .max(100)
    .regex(
        /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/,
    )
    .describe("ISO date/time; include Z or an offset for an absolute instant");
const zone = z
    .string()
    .min(1)
    .max(100)
    .describe("IANA time zone, for example Europe/Berlin");
const zones = z.array(zone).max(20);

function instant(time, fromZone) {
    if (/(?:Z|[+-]\d{2}:\d{2})$/i.test(time)) {
        if (fromZone !== undefined)
            throw new Error(
                "Omit from_timezone when time already includes an offset",
            );
        return Temporal.Instant.from(time);
    }
    // Do not silently choose an instant for a skipped or repeated local time.
    return Temporal.PlainDateTime.from(time, { overflow: "reject" })
        .toZonedDateTime(fromZone ?? "UTC", { disambiguation: "reject" })
        .toInstant();
}

function views(value, timezones) {
    return {
        utc: value.toString(),
        unixMillis: value.epochMilliseconds,
        zones: Object.fromEntries(
            timezones.map((name) => [
                name,
                value.toZonedDateTimeISO(name).toString(),
            ]),
        ),
    };
}

export const timeTools = [
    [
        "time_now",
        "Read the current UTC instant and its local time in requested IANA zones.",
        { timezones: zones.default([]) },
        ({ timezones }) => views(Temporal.Now.instant(), timezones),
    ],
    [
        "time_convert",
        "Convert an instant or local date/time to IANA zones. Ambiguous or nonexistent local times are rejected; supply an explicit offset to disambiguate.",
        {
            time: timestamp,
            from_timezone: zone.optional(),
            to_timezones: zones.default(["UTC"]),
        },
        ({ time, from_timezone, to_timezones }) =>
            views(instant(time, from_timezone), to_timezones),
    ],
    [
        "time_math",
        "UTC calendar arithmetic: add/subtract units (month-end clamping), or measure the duration to an end instant. Provide exactly one of changes or end. Change values must have the same sign. A day is 24 hours, not a local DST calendar day.",
        {
            start: timestamp,
            changes: z
                .object(
                    Object.fromEntries(
                        [
                            "years",
                            "months",
                            "weeks",
                            "days",
                            "hours",
                            "minutes",
                            "seconds",
                        ].map((unit) => [
                            unit,
                            z
                                .number()
                                .int()
                                .min(-100000)
                                .max(100000)
                                .optional(),
                        ]),
                    ),
                )
                .optional(),
            end: timestamp.optional(),
        },
        ({ start, changes, end }) => {
            if ((changes === undefined) === (end === undefined))
                throw new Error("Provide exactly one of changes or end");
            const from = instant(start).toZonedDateTimeISO("UTC");
            if (end !== undefined) {
                const to = instant(end).toZonedDateTimeISO("UTC");
                return {
                    start: from.toInstant().toString(),
                    end: to.toInstant().toString(),
                    duration: from
                        .until(to, { largestUnit: "years" })
                        .toString(),
                    totalSeconds:
                        (to.epochMilliseconds - from.epochMilliseconds) / 1000,
                };
            }
            return {
                start: from.toInstant().toString(),
                changes,
                result: from.add(changes).toInstant().toString(),
            };
        },
    ],
    [
        "next_cron_runs",
        "Evaluate a five-field Unix cron schedule in an IANA zone. Start is exclusive; day-of-month and day-of-week use cron OR semantics. Uses Croner's daylight-saving rules; inspect UTC and local run times. Returns fewer runs if no future dates match.",
        {
            expression: z.string().trim().min(1).max(200),
            timezone: zone.default("UTC"),
            start: z.iso.datetime({ offset: true }).optional(),
            count: z.number().int().min(1).max(20).default(5),
        },
        ({ expression, timezone, start, count }) => {
            const from = start
                ? Temporal.Instant.from(start)
                : Temporal.Now.instant();
            from.toZonedDateTimeISO(timezone); // Validate the zone even for expressions with no future matches.
            const cron = new Cron(expression, {
                mode: "5-part",
                paused: true,
                timezone,
            });
            // nextRuns can repeat an hourly run shifted out of a DST gap.
            // Advancing from the actual instant avoids that duplicate.
            const dates = [];
            for (
                let next = cron.nextRun(new Date(from.epochMilliseconds));
                next && dates.length < count;
                next = cron.nextRun(next)
            )
                dates.push(next);
            return {
                expression,
                timezone,
                start: from.toString(),
                runs: dates.map((date) => {
                    const value = Temporal.Instant.fromEpochMilliseconds(
                        date.getTime(),
                    );
                    return {
                        utc: value.toString(),
                        local: value.toZonedDateTimeISO(timezone).toString(),
                    };
                }),
            };
        },
    ],
];
