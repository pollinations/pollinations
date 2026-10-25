import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

// Time math is done on instants with Intl doing the timezone work, so DST
// rules come from the platform tz database instead of a hand-kept table.
// ponytail: day and week additions are absolute 24h and 7d spans, so across
// a DST change the local clock time shifts by the DST delta. That is the
// defined behavior; calendar-aware wall-clock arithmetic is the upgrade.

const UNIT_MS = {
    seconds: 1_000,
    minutes: 60_000,
    hours: 3_600_000,
    days: 86_400_000,
    weeks: 604_800_000,
};

const partsFormatters = new Map();
const weekdayFormatters = new Map();

function partsFormatter(zone) {
    let formatter = partsFormatters.get(zone);
    if (!formatter) {
        formatter = new Intl.DateTimeFormat("en-US", {
            timeZone: zone,
            hourCycle: "h23",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
        partsFormatters.set(zone, formatter);
    }
    return formatter;
}

function canonicalZone(zone) {
    try {
        return new Intl.DateTimeFormat("en-US", {
            timeZone: zone,
        }).resolvedOptions().timeZone;
    } catch {
        throw new Error(
            `Unknown timezone "${zone}". Use an IANA name like "Europe/Berlin".`,
        );
    }
}

function zonedParts(date, zone) {
    const parts = {};
    for (const part of partsFormatter(zone).formatToParts(date)) {
        if (part.type !== "literal") parts[part.type] = part.value;
    }
    parts.hour = String(Number(parts.hour) % 24).padStart(2, "0");
    return parts;
}

function offsetMinutesAt(date, zone) {
    const parts = zonedParts(date, zone);
    const wallAsUtc = Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour),
        Number(parts.minute),
        Number(parts.second),
    );
    const instantSecond = Math.floor(date.getTime() / 1000) * 1000;
    return Math.round((wallAsUtc - instantSecond) / 60_000);
}

function formatOffset(offsetMinutes) {
    const sign = offsetMinutes < 0 ? "-" : "+";
    const abs = Math.abs(offsetMinutes);
    const hours = String(Math.floor(abs / 60)).padStart(2, "0");
    const minutes = String(abs % 60).padStart(2, "0");
    return `${sign}${hours}:${minutes}`;
}

function renderInZone(date, zone) {
    const parts = zonedParts(date, zone);
    const offset = formatOffset(offsetMinutesAt(date, zone));
    let weekdayFormatter = weekdayFormatters.get(zone);
    if (!weekdayFormatter) {
        weekdayFormatter = new Intl.DateTimeFormat("en-US", {
            timeZone: zone,
            weekday: "long",
        });
        weekdayFormatters.set(zone, weekdayFormatter);
    }
    const datePart = `${parts.year}-${parts.month}-${parts.day}`;
    const timePart = `${parts.hour}:${parts.minute}:${parts.second}`;
    return {
        zone,
        local: `${datePart}T${timePart}${offset}`,
        date: datePart,
        time: timePart,
        weekday: weekdayFormatter.format(date),
        utcOffset: offset,
    };
}

const DATETIME_PATTERN =
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?\s*(z|[+-]\d{2}:?\d{2})?$/i;

function parseDateTime(datetime, zone) {
    const match = DATETIME_PATTERN.exec(datetime.trim());
    if (!match) {
        throw new Error(
            `Invalid datetime "${datetime}". Use ISO 8601, for example "2026-01-15T12:00:00".`,
        );
    }
    const [
        ,
        year,
        month,
        day,
        hour = "00",
        minute = "00",
        second = "00",
        fraction = "0",
        designator,
    ] = match;
    const wallMs =
        Date.UTC(
            Number(year),
            Number(month) - 1,
            Number(day),
            Number(hour),
            Number(minute),
            Number(second),
        ) + Number(fraction.padEnd(3, "0"));
    const check = new Date(wallMs);
    if (
        check.getUTCFullYear() !== Number(year) ||
        check.getUTCMonth() !== Number(month) - 1 ||
        check.getUTCDate() !== Number(day) ||
        check.getUTCHours() !== Number(hour) ||
        check.getUTCMinutes() !== Number(minute) ||
        check.getUTCSeconds() !== Number(second)
    ) {
        throw new Error(`Invalid datetime "${datetime}".`);
    }
    if (designator) {
        if (designator.toLowerCase() === "z") return new Date(wallMs);
        const sign = designator.startsWith("-") ? -1 : 1;
        const digits = designator.slice(1).replace(":", "");
        const offsetMs =
            sign *
            (Number(digits.slice(0, 2)) * 3_600_000 +
                Number(digits.slice(2)) * 60_000);
        return new Date(wallMs - offsetMs);
    }
    // No offset given: the fields are wall-clock time in the given zone.
    // Resolve the zone offset at that wall time with two passes so the
    // answer stays right on DST transition days.
    let instant = wallMs;
    for (let i = 0; i < 2; i++) {
        const next = wallMs - offsetMinutesAt(new Date(instant), zone) * 60_000;
        if (next === instant) break;
        instant = next;
    }
    return new Date(instant);
}

function textResult(value) {
    return {
        content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    };
}

function buildServer() {
    const server = new McpServer(
        { name: "time-mcp", title: "Time MCP", version: "0.1.0" },
        {
            instructions:
                "Deterministic time tools: current time, timezone conversion, and date arithmetic. Use them instead of computing dates or offsets yourself.",
            capabilities: { tools: {} },
        },
    );

    server.registerTool(
        "current_time",
        {
            description:
                "Current time in an IANA timezone, with its UTC offset and weekday. Defaults to UTC.",
            inputSchema: z.object({
                zone: z.string().min(1).optional(),
            }),
        },
        async ({ zone }) => {
            const now = new Date();
            return textResult({
                instant: now.toISOString(),
                unixSeconds: Math.floor(now.getTime() / 1000),
                ...renderInZone(now, canonicalZone(zone ?? "UTC")),
            });
        },
    );

    server.registerTool(
        "convert_time",
        {
            description:
                "Convert a datetime between IANA timezones. A datetime without an offset is read as wall-clock time in from_zone (default UTC). Returns both renderings and whether the calendar day changes.",
            inputSchema: z.object({
                datetime: z.string().min(1),
                from_zone: z.string().min(1).optional(),
                to_zone: z.string().min(1),
            }),
        },
        async ({ datetime, from_zone, to_zone }) => {
            const sourceZone = canonicalZone(from_zone ?? "UTC");
            const targetZone = canonicalZone(to_zone);
            const instant = parseDateTime(datetime, sourceZone);
            const source = renderInZone(instant, sourceZone);
            const target = renderInZone(instant, targetZone);
            return textResult({
                instant: instant.toISOString(),
                source,
                target,
                sameDay: source.date === target.date,
            });
        },
    );

    server.registerTool(
        "add_time",
        {
            description:
                "Add or subtract an amount of time to a datetime. Negative amounts subtract. Days and weeks are absolute 24h and 7d spans, so the local clock time can shift across a DST change. A datetime without an offset is read as wall-clock time in zone (default UTC).",
            inputSchema: z.object({
                datetime: z.string().min(1),
                zone: z.string().min(1).optional(),
                amount: z.number().finite(),
                unit: z.enum(["seconds", "minutes", "hours", "days", "weeks"]),
            }),
        },
        async ({ datetime, zone, amount, unit }) => {
            const resolvedZone = canonicalZone(zone ?? "UTC");
            const start = parseDateTime(datetime, resolvedZone);
            const end = new Date(start.getTime() + amount * UNIT_MS[unit]);
            return textResult({
                added: `${amount} ${unit}`,
                start: renderInZone(start, resolvedZone),
                end: renderInZone(end, resolvedZone),
                instant: end.toISOString(),
            });
        },
    );

    return server;
}

const mcpHandler = createMcpHandler(() => buildServer(), {
    legacy: "stateless",
    onerror: (error) => console.error(error),
});

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "time-mcp",
                transport: "streamable-http",
                endpoint: "/",
                stateless: true,
            });
        }

        if (url.pathname !== "/") {
            return new Response("Not found", { status: 404 });
        }

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

        return mcpHandler.fetch(request);
    },
};
