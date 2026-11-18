import { z } from "zod";

const API_ROOT = "https://ssd-api.jpl.nasa.gov/fireball.api";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_DATE_MIN = "2026-01-01";
const DEFAULT_LIMIT = 5;

// The API answers in a tabular shape: a `fields` array naming the columns
// and `data` rows of positional strings, e.g.
//   fields: ["date","energy","impact-e","lat","lat-dir","lon","lon-dir","alt","vel"]
//   data: [["2026-10-04 03:14:45","5.4","0.18","41.8","S","173.1","W","26.9","13.8"]]
// Latitude/longitude arrive as magnitudes plus a direction letter, and
// velocity is null when the sensors did not measure one — so the projection
// below converts directions to signs and keeps nulls as nulls.
function cell(row, fields, name) {
    const i = Array.isArray(fields) ? fields.indexOf(name) : -1;
    if (i < 0 || i >= row.length) return null;
    const value = row[i];
    return value === undefined ? null : value;
}

function asNumber(value) {
    if (value === null || value === undefined) return null;
    const n = Number.parseFloat(value);
    return Number.isNaN(n) ? null : n;
}

function signed(value, direction, negative) {
    const n = asNumber(value);
    if (n === null) return null;
    return direction === negative ? -n : n;
}

function formatEvent(row, fields) {
    return {
        date: cell(row, fields, "date"),
        energy_kt: asNumber(cell(row, fields, "energy")),
        impact_energy_kt: asNumber(cell(row, fields, "impact-e")),
        latitude: signed(
            cell(row, fields, "lat"),
            cell(row, fields, "lat-dir"),
            "S",
        ),
        longitude: signed(
            cell(row, fields, "lon"),
            cell(row, fields, "lon-dir"),
            "W",
        ),
        altitude_km: asNumber(cell(row, fields, "alt")),
        velocity_km_s: asNumber(cell(row, fields, "vel")),
    };
}

function validateInput({ date_min, limit }) {
    // Zod rejects a bad date at the MCP layer; a direct handler call falls
    // back to the default instead of failing.
    const dateMin =
        typeof date_min === "string" &&
        DATE_PATTERN.test(date_min.trim()) &&
        !Number.isNaN(Date.parse(date_min.trim()))
            ? date_min.trim()
            : DEFAULT_DATE_MIN;
    // Zod rejects out-of-range limits at the MCP layer; a direct handler
    // call falls back to the default instead of failing.
    const n =
        Number.isInteger(limit) && limit >= 1 && limit <= 10
            ? limit
            : DEFAULT_LIMIT;
    return { dateMin, n };
}

export const fireballTools = [
    [
        "fireball_events",
        "List recent fireball events (bright meteors detected by US government sensors) from NASA/JPL's Fireball Data API since a given date, with date, radiated and impact energy in kilotons of TNT, location, altitude in km and velocity in km/s. A date range with no events returns an empty list, not an error.",
        {
            date_min: z
                .string()
                .regex(/^\d{4}-\d{2}-\d{2}$/)
                .default(DEFAULT_DATE_MIN)
                .describe(
                    "Only events on or after this date, YYYY-MM-DD (default 2026-01-01)",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe(
                    "Maximum number of events to return (1-10, default 5)",
                ),
        },
        async ({ date_min, limit }, fetchJson) => {
            const { dateMin, n } = validateInput({ date_min, limit });
            const url =
                `${API_ROOT}?date-min=${encodeURIComponent(dateMin)}` +
                `&req-alt=true&limit=${n}`;
            const data = await fetchJson(url);
            if (
                !data ||
                typeof data !== "object" ||
                typeof data.count === "undefined"
            ) {
                throw new Error(
                    "Fireball API returned an unexpected response.",
                );
            }
            const rows = Array.isArray(data.data) ? data.data : [];
            return {
                date_min: dateMin,
                total: rows.length,
                events: rows.map((row) => formatEvent(row, data.fields)),
            };
        },
    ],
];
