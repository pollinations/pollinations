import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

// Tools are pure date math on V8's Intl timezone database: no model calls,
// no external services, nothing billed.

const MAX_ZONES = 20;

const ISO_PATTERN =
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?(Z|[+-]\d{2}:\d{2})?$/;

const formatters = new Map();

function formatter(zone, options) {
    const key = `${zone}|${JSON.stringify(options)}`;
    let formatToParts = formatters.get(key);
    if (!formatToParts) {
        const instance = new Intl.DateTimeFormat("en-US", {
            timeZone: zone,
            ...options,
        });
        formatToParts = instance.formatToParts.bind(instance);
        formatters.set(key, formatToParts);
    }
    return formatToParts;
}

function zoneParts(zone, date) {
    const parts = {};
    for (const part of formatter(zone, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    })(date)) {
        parts[part.type] = part.value;
    }
    return parts;
}

function zoneOffsetMs(zone, date) {
    for (const part of formatter(zone, { timeZoneName: "longOffset" })(date)) {
        if (part.type !== "timeZoneName") continue;
        const match = part.value.match(/GMT([+-])(\d{2}):(\d{2})/);
        if (match) {
            const [, sign, hours, minutes] = match;
            const magnitude = (Number(hours) * 60 + Number(minutes)) * 60_000;
            return sign === "-" ? -magnitude : magnitude;
        }
        return 0; // GMT, the only offset-free form longOffset emits
    }
    throw new Error(`No offset reported for timezone ${zone}.`);
}

function zoneLongName(zone, date) {
    for (const part of formatter(zone, { timeZoneName: "long" })(date)) {
        if (part.type === "timeZoneName") return part.value;
    }
    return zone;
}

function offsetString(offsetMs) {
    const sign = offsetMs < 0 ? "-" : "+";
    const totalMinutes = Math.abs(offsetMs) / 60_000;
    const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
    const minutes = String(totalMinutes % 60).padStart(2, "0");
    return `${sign}${hours}:${minutes}`;
}

function localIso(zone, date) {
    const p = zoneParts(zone, date);
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${offsetString(zoneOffsetMs(zone, date))}`;
}

/** Renders one instant in a zone, for time_now and time_convert output. */
function zoneView(zone, date) {
    if (!isValidZone(zone)) throw new Error(`Unknown timezone ${zone}.`);
    return {
        iso: localIso(zone, date),
        offset: offsetString(zoneOffsetMs(zone, date)),
        name: zoneLongName(zone, date),
    };
}

function isValidZone(zone) {
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: zone });
        return true;
    } catch {
        return false;
    }
}

function parseOffset(offset) {
    if (!offset) return null;
    if (offset === "Z") return 0;
    const match = offset.match(/^([+-])(\d{2}):(\d{2})$/);
    if (!match) return null;
    const magnitude = (Number(match[2]) * 60 + Number(match[3])) * 60_000;
    return match[1] === "-" ? -magnitude : magnitude;
}

/**
 * Parses an ISO-8601-ish instant or naive wall-clock time.
 * Naive times (no offset) are UTC until zoneFromNaive applies a zone.
 */
function parseTime(time) {
    const match = ISO_PATTERN.exec(time.trim());
    if (!match) {
        throw new Error(
            `Could not read ${JSON.stringify(time)} as a date or datetime. Use ISO 8601, like 2026-10-18 or 2026-10-18T09:30:00.`,
        );
    }
    const [, year, month, day, hour, minute, second, millisecond, offset] =
        match;
    const ms = Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        hour ? Number(hour) : 0,
        minute ? Number(minute) : 0,
        second ? Number(second) : 0,
        millisecond ? Number(millisecond.padEnd(3, "0")) : 0,
    );
    const date = new Date(ms);
    if (
        date.getUTCMonth() !== Number(month) - 1 ||
        date.getUTCDate() !== Number(day)
    ) {
        throw new Error(`${JSON.stringify(time)} is not a real calendar date.`);
    }
    return {
        date,
        offset: parseOffset(offset),
    };
}

/** Applies a wall-clock time in a zone, folding in DST via two offset passes. */
function zoneFromNaive(date, zone) {
    if (!isValidZone(zone)) throw new Error(`Unknown timezone ${zone}.`);
    const naiveMs = date.getTime();
    return new Date(naiveMs - zoneOffsetMs(zone, new Date(naiveMs)));
}

function resolveInstant(time, zone) {
    const parsed = parseTime(time);
    if (parsed.offset !== null) {
        if (zone !== undefined) {
            throw new Error(
                `${JSON.stringify(time)} already carries an offset; drop the from_timezone argument.`,
            );
        }
        return new Date(parsed.date.getTime() - parsed.offset);
    }
    return zoneFromNaive(parsed.date, zone ?? "UTC");
}

function daysInMonth(year, month) {
    return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function utcParts(date) {
    return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth(),
        day: date.getUTCDate(),
        hours: date.getUTCHours(),
        minutes: date.getUTCMinutes(),
        seconds: date.getUTCSeconds(),
        milliseconds: date.getUTCMilliseconds(),
    };
}

function fromUtcParts(parts) {
    return new Date(
        Date.UTC(
            parts.year,
            parts.month,
            parts.day,
            parts.hours,
            parts.minutes,
            parts.seconds,
            parts.milliseconds,
        ),
    );
}

/** Adds calendar units in UTC, clamping like Temporal: Jan 31 + 1 month = Feb 28. */
function addChanges(date, changes) {
    const parts = utcParts(date);
    const totalMonths =
        parts.year * 12 +
        parts.month +
        (changes.years ?? 0) * 12 +
        (changes.months ?? 0);
    parts.year = Math.floor(totalMonths / 12);
    parts.month = totalMonths % 12;
    if (parts.month < 0) {
        parts.month += 12;
        parts.year -= 1;
    }
    parts.day = Math.min(parts.day, daysInMonth(parts.year, parts.month));
    let ms = fromUtcParts(parts).getTime();
    ms +=
        ((changes.weeks ?? 0) * 7 + (changes.days ?? 0)) * 86_400_000 +
        (changes.hours ?? 0) * 3_600_000 +
        (changes.minutes ?? 0) * 60_000 +
        (changes.seconds ?? 0) * 1_000;
    return new Date(ms);
}

function addMonths(start, months) {
    const parts = utcParts(start);
    const totalMonths = parts.year * 12 + parts.month + months;
    parts.year = Math.floor(totalMonths / 12);
    parts.month = totalMonths % 12;
    parts.day = Math.min(parts.day, daysInMonth(parts.year, parts.month));
    return fromUtcParts(parts);
}

/** Calendar-aware diff in UTC: years, then months, then days, hours, minutes, seconds. */
function diffCalendar(start, end) {
    const sign = end.getTime() < start.getTime() ? -1 : 1;
    const rawMs = Math.abs(end.getTime() - start.getTime());
    if (sign === -1) [start, end] = [end, start];
    let cursor = start;
    let years = 0;
    while (addMonths(cursor, (years + 1) * 12).getTime() <= end.getTime()) {
        years++;
    }
    cursor = addMonths(cursor, years * 12);
    let months = 0;
    while (addMonths(cursor, months + 1).getTime() <= end.getTime()) months++;
    cursor = addMonths(cursor, months);
    const remainderMs = end.getTime() - cursor.getTime();
    const days = Math.floor(remainderMs / 86_400_000);
    const secondsTotal = remainderMs / 1_000;
    const round = (value) => Math.round(value * 1000) / 1000;
    return {
        sign,
        years,
        months,
        days,
        hours: Math.floor(remainderMs / 3_600_000) % 24,
        minutes: Math.floor(remainderMs / 60_000) % 60,
        seconds: Math.floor(secondsTotal) % 60,
        totalDays: round(rawMs / 86_400_000),
        totalSeconds: round(rawMs / 1_000),
    };
}

function buildServer() {
    const server = new McpServer(
        { name: "time-mcp", title: "Time MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );

    server.registerTool(
        "time_now",
        {
            description:
                "Read the current date and time: an ISO-8601 UTC instant, unix time, and the same moment in any requested IANA timezones. " +
                "Use this whenever the current time, day of the week, or date matters; never guess it.",
            inputSchema: z.object({
                timezones: z
                    .array(z.string())
                    .max(MAX_ZONES)
                    .optional()
                    .describe(
                        'IANA timezone names to report alongside UTC, for example ["Asia/Singapore", "America/New_York"]',
                    ),
            }),
        },
        async ({ timezones = [] }) => {
            const now = new Date();
            const zones = {};
            for (const zone of timezones) {
                if (zones[zone]) continue;
                zones[zone] = zoneView(zone, now);
            }
            return createMCPResponse([
                createTextContent(
                    {
                        utc: {
                            iso: now.toISOString(),
                            unixSeconds: Math.floor(now.getTime() / 1_000),
                            unixMillis: now.getTime(),
                            weekday: formatter("UTC", {
                                weekday: "long",
                            })(now).find((part) => part.type === "weekday")
                                .value,
                        },
                        zones,
                    },
                    true,
                ),
            ]);
        },
    );

    server.registerTool(
        "time_convert",
        {
            description:
                "Convert a time between timezones, DST-correct. Pass a wall-clock time without an offset together with from_timezone, or a full instant with its own offset. Returns the UTC instant and its local rendering in each requested timezone.",
            inputSchema: z.object({
                time: z
                    .string()
                    .min(1)
                    .describe(
                        "ISO 8601. With an offset (…Z or …±HH:MM) it is absolute; without one it is a wall-clock time read in from_timezone",
                    ),
                from_timezone: z
                    .string()
                    .optional()
                    .describe(
                        "IANA timezone the wall-clock time belongs to, when time has no offset. Default: UTC",
                    ),
                to_timezones: z
                    .array(z.string())
                    .max(MAX_ZONES)
                    .optional()
                    .describe('IANA timezones to report. Default: ["UTC"]'),
            }),
        },
        async ({ time, from_timezone, to_timezones = ["UTC"] }) => {
            const instant = resolveInstant(time, from_timezone);
            const zones = {};
            for (const zone of to_timezones) {
                if (zones[zone]) continue;
                zones[zone] = zoneView(zone, instant);
            }
            return createMCPResponse([
                createTextContent(
                    {
                        utc: {
                            iso: instant.toISOString(),
                            unixSeconds: Math.floor(instant.getTime() / 1_000),
                        },
                        zones,
                    },
                    true,
                ),
            ]);
        },
    );

    server.registerTool(
        "time_math",
        {
            description:
                "UTC date arithmetic: add or subtract calendar units with month-end clamping (Jan 31 + 1 month = Feb 28), or get the exact calendar breakdown between two times. Give exactly one of changes or end.",
            inputSchema: z.object({
                start: z
                    .string()
                    .min(1)
                    .describe(
                        "ISO 8601 start time. Without an offset it is read as UTC",
                    ),
                changes: z
                    .object({
                        years: z.number().int().optional(),
                        months: z.number().int().optional(),
                        weeks: z.number().int().optional(),
                        days: z.number().int().optional(),
                        hours: z.number().int().optional(),
                        minutes: z.number().int().optional(),
                        seconds: z.number().int().optional(),
                    })
                    .optional()
                    .describe(
                        "Units to add; negative values subtract. All given units apply, years and months calendar-aware",
                    ),
                end: z
                    .string()
                    .min(1)
                    .optional()
                    .describe(
                        "ISO 8601 end time to measure the calendar distance to. Without an offset it is read as UTC",
                    ),
            }),
        },
        async ({ start, changes, end }) => {
            if ((changes === undefined) === (end === undefined)) {
                throw new Error(
                    "Give exactly one of changes or end, not both and not neither.",
                );
            }
            const startDate = resolveInstant(start);
            if (end !== undefined) {
                const endDate = resolveInstant(end);
                return createMCPResponse([
                    createTextContent(
                        {
                            start: startDate.toISOString(),
                            end: endDate.toISOString(),
                            duration: diffCalendar(startDate, endDate),
                        },
                        true,
                    ),
                ]);
            }
            const result = addChanges(startDate, changes);
            return createMCPResponse([
                createTextContent(
                    {
                        start: startDate.toISOString(),
                        changes,
                        result: result.toISOString(),
                    },
                    true,
                ),
            ]);
        },
    );

    return server;
}

const mcpHandler = createMcpHandler(() => buildServer(), {
    legacy: "stateless",
    onerror: (error) => console.error(error),
});

function readBearerToken(request) {
    const authorization = request.headers.get("authorization");
    if (!authorization) return null;

    const [scheme, token] = authorization.trim().split(/\s+/, 2);
    if (scheme?.toLowerCase() !== "bearer" || !token) {
        return null;
    }
    return token;
}

function unauthorizedResponse() {
    return Response.json(
        {
            error: "unauthorized",
            message: "Send a Pollinations API key as a bearer token.",
        },
        {
            status: 401,
            headers: {
                "WWW-Authenticate": 'Bearer realm="time-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                status: "ok",
                service: "time-mcp",
                endpoint: "/",
            });
        }

        if (url.pathname !== "/") {
            return new Response("Not found", { status: 404 });
        }

        const token = readBearerToken(request);
        if (!token) return unauthorizedResponse();

        if (
            request.method === "POST" &&
            Array.isArray(
                await request
                    .clone()
                    .json()
                    .catch(() => null),
            )
        ) {
            return Response.json(
                {
                    error: "invalid_request",
                    message: "Batch requests are not supported.",
                },
                { status: 400 },
            );
        }

        return mcpHandler.fetch(request, {
            authInfo: {
                token,
                clientId: "pollinations-api-key",
                scopes: [],
            },
        });
    },
};
