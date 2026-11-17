import { z } from "zod";
import { fetchJson } from "../fetch.js";

const BASE = "https://date.nager.at/api/v4";
const WEEKDAYS = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];

const countrySchema = z
    .string()
    .trim()
    .regex(
        /^[A-Za-z]{2}$/,
        "Use a two-letter ISO 3166-1 alpha-2 code, e.g. DE.",
    )
    .describe("Two-letter ISO 3166-1 alpha-2 country code, e.g. DE or US");

// Kept out of the schema so the published JSON Schema stays a plain string.
const codeOf = (country) => country.trim().toUpperCase();

// The API publishes a rolling window of recent and upcoming years and rejects
// older or far-future ones; the bounds below only catch obvious mistakes.
const MIN_YEAR = 1900;
const MAX_YEAR = 2200;
const yearSchema = z
    .number()
    .int()
    .min(MIN_YEAR)
    .max(MAX_YEAR)
    .describe(
        "Calendar year. Nager.Date publishes a rolling window of recent and upcoming years; other years fail with an explanatory error.",
    );

const dateSchema = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")
    .describe("Calendar date in YYYY-MM-DD form");

function parseDate(date) {
    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!parts) throw new Error(`Invalid date ${date}; use YYYY-MM-DD.`);
    const [year, month, day] = parts.slice(1).map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
        parsed.getUTCFullYear() !== year ||
        parsed.getUTCMonth() !== month - 1 ||
        parsed.getUTCDate() !== day
    )
        throw new Error(`${date} is not a real calendar date.`);
    return parsed;
}

function weekdayOf(date) {
    return WEEKDAYS[parseDate(date).getUTCDay()];
}

function todayIso() {
    return new Date().toISOString().slice(0, 10);
}

function daysBetween(from, to) {
    const a = Date.parse(`${from}T00:00:00Z`);
    const b = Date.parse(`${to}T00:00:00Z`);
    return Math.round((b - a) / 86_400_000);
}

// Nager.Date answers 404 for an unknown country and 400 for a year outside its
// published window; both are caller mistakes, so turn them into actionable
// messages. A 204 response means the source lists no holidays and stays null.
async function fetchHolidays(url, country) {
    try {
        return await fetchJson(url);
    } catch (error) {
        if (/HTTP 404/.test(error.message))
            throw new Error(
                `Unknown country code ${country}. Call available_countries to list supported codes.`,
            );
        if (/HTTP 400/.test(error.message))
            throw new Error(
                "Nager.Date publishes only a rolling window of recent and upcoming years; pick a year near the current one.",
            );
        throw error;
    }
}

function shapeHoliday(holiday) {
    return {
        date: holiday.date,
        weekday: weekdayOf(holiday.date),
        name: holiday.name,
        types: holiday.holidayTypes ?? [],
        nationwide: holiday.nationalHoliday === true,
        subdivisions: holiday.subdivisionCodes ?? [],
    };
}

export const holidaysTools = [
    [
        "public_holidays",
        "List the public holidays of a country for one calendar year from Nager.Date. Returns the English name, holiday types, weekday, and whether the day applies nationwide or only to listed ISO 3166-2 subdivisions. Public data; no credentials required.",
        z.object({
            country: countrySchema,
            year: yearSchema
                .default(new Date().getUTCFullYear())
                .describe(
                    "Calendar year (default: current year); Nager.Date publishes a rolling window of recent and upcoming years",
                ),
        }),
        async ({ country, year }) => {
            const code = codeOf(country);
            const holidays =
                (await fetchHolidays(
                    `${BASE}/Holidays/${code}/${year}`,
                    code,
                )) ?? [];
            return {
                country: code,
                year,
                total: holidays.length,
                holidays: holidays.map(shapeHoliday),
            };
        },
    ],
    [
        "next_holidays",
        "List the upcoming public holidays of a country within the next 365 days, starting with the nearest one. Useful for planning around closures. Public data; no credentials required.",
        z.object({
            country: countrySchema,
            limit: z
                .number()
                .int()
                .min(1)
                .max(25)
                .default(5)
                .describe(
                    "Maximum number of holidays to return (default: 5, max: 25)",
                ),
        }),
        async ({ country, limit }) => {
            const code = codeOf(country);
            const data = await fetchHolidays(
                `${BASE}/Holidays/${code}/Next`,
                code,
            );
            const today = todayIso();
            const holidays = (data ?? []).slice(0, limit);
            return {
                country: code,
                today,
                total: holidays.length,
                holidays: holidays.map((holiday) => ({
                    ...shapeHoliday(holiday),
                    daysUntil: daysBetween(today, holiday.date),
                })),
            };
        },
    ],
    [
        "is_holiday",
        "Check whether a specific date is a public holiday in a country. Returns the matching holiday entry, or the fact that the date is a regular working day. Public data; no credentials required.",
        z.object({
            country: countrySchema,
            date: dateSchema,
        }),
        async ({ country, date }) => {
            const code = codeOf(country);
            const weekday = weekdayOf(date);
            const year = Number(date.slice(0, 4));
            if (year < MIN_YEAR || year > MAX_YEAR)
                throw new Error(
                    `Date is outside the supported range ${MIN_YEAR}-${MAX_YEAR}.`,
                );
            const holidays =
                (await fetchHolidays(
                    `${BASE}/Holidays/${code}/${year}`,
                    code,
                )) ?? [];
            const match = holidays.find((holiday) => holiday.date === date);
            return {
                country: code,
                date,
                weekday,
                isPublicHoliday: Boolean(match),
                holiday: match ? shapeHoliday(match) : null,
                daysUntil: daysBetween(todayIso(), date),
            };
        },
    ],
    [
        "available_countries",
        "List the countries covered by Nager.Date, with their ISO 3166-1 alpha-2 code and English name. Optionally filter by a name or exact code. Public data; no credentials required.",
        z.object({
            search: z
                .string()
                .trim()
                .min(1)
                .max(40)
                .optional()
                .describe(
                    "Optional case-insensitive filter on the country name or exact code, e.g. 'ger' or 'DE'",
                ),
        }),
        async ({ search }) => {
            const countries = await fetchJson(`${BASE}/Countries/Available`);
            if (!Array.isArray(countries))
                throw new Error("Unexpected response from date.nager.at.");
            const needle = search?.toLowerCase();
            const matches = needle
                ? countries.filter(
                      (country) =>
                          country.name.toLowerCase().includes(needle) ||
                          country.countryCode.toLowerCase() === needle,
                  )
                : countries;
            return {
                total: countries.length,
                matches: matches.length,
                countries: matches.map((country) => ({
                    code: country.countryCode,
                    name: country.name,
                })),
            };
        },
    ],
];
