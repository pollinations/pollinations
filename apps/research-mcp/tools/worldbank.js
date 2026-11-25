// Adapted from gggff123's #18068; grouped under the shared private Worker.
import { z } from "zod";
import { fetchJson } from "../fetch.js";

const API_ROOT = "https://api.worldbank.org/v2";
const MAX_OBSERVATIONS = 2_000;
// The caller's Pollinations key authenticates the proxy. The World Bank API is
// public, so the key is never forwarded upstream.

// A short, stable catalog of the indicators agents ask for most. Any other
// World Bank indicator code still works with get_indicator_data.
const indicatorSchema = z
    .string()
    .min(1)
    .max(100)
    .describe(
        "Official World Bank indicator code, such as NY.GDP.MKTP.CD or SP.POP.TOTL.",
    );

const countrySchema = z
    .string()
    .regex(/^[A-Za-z]{2,3}$/)
    .describe("ISO 3166 country code, two or three letters (US or USA).");

function worldBankError(payload, fallback) {
    const message = payload?.[0]?.message?.[0]?.value;
    return new Error(`${fallback}${message ? `: ${message}` : ""}.`);
}

export const worldBankTools = [
    [
        "get_indicator_data",
        "Fetch yearly values of a World Bank indicator for up to ten countries. Returns the newest observations first and omits missing values. Use this for comparisons over time or across countries.",
        {
            indicator: indicatorSchema,
            countries: z
                .array(countrySchema)
                .min(1)
                .max(10)
                .default(["US"])
                .describe('Countries to include, for example ["US", "CN"].'),
            start_year: z
                .number()
                .int()
                .min(1960)
                .max(2100)
                .optional()
                .describe("First year to include. Defaults to ten years ago."),
            end_year: z
                .number()
                .int()
                .min(1960)
                .max(2100)
                .optional()
                .describe(
                    "Last year to include. Defaults to the current year.",
                ),
            limit_per_country: z
                .number()
                .int()
                .min(1)
                .max(30)
                .default(5)
                .describe("Newest observations to return per country."),
        },
        async ({
            indicator,
            countries,
            start_year,
            end_year,
            limit_per_country,
        }) => {
            const code = indicator.trim();
            const endYear = end_year ?? new Date().getUTCFullYear();
            const startYear = start_year ?? endYear - 10;
            if (startYear > endYear) {
                throw new Error("start_year must not be after end_year.");
            }

            const codes = countries.map((code) => code.toUpperCase());
            const url = new URL(
                `${API_ROOT}/country/${codes.join(";")}/indicator/${encodeURIComponent(code)}`,
            );
            url.search = new URLSearchParams({
                format: "json",
                per_page: String(MAX_OBSERVATIONS),
                date: `${startYear}:${endYear}`,
            }).toString();

            const payload = await fetchJson(url, "World Bank data");
            const rows = payload?.[1];
            if (!Array.isArray(rows)) {
                throw worldBankError(
                    payload,
                    "World Bank rejected the request",
                );
            }

            const byCountry = new Map();
            for (const row of rows) {
                if (row.value === null || row.value === undefined) continue;
                const key = row.countryiso3code ?? row.country?.id ?? "unknown";
                if (!byCountry.has(key)) {
                    byCountry.set(key, {
                        country: row.country?.value ?? key,
                        country_code: key,
                        observations: [],
                    });
                }
                byCountry.get(key).observations.push({
                    year: row.date,
                    value: row.value,
                });
            }

            const data = [...byCountry.values()].map((entry) => ({
                ...entry,
                observations: entry.observations
                    .sort((a, b) =>
                        String(b.year).localeCompare(String(a.year)),
                    )
                    .slice(0, limit_per_country),
            }));

            return {
                indicator: {
                    code,
                    name: rows[0]?.indicator?.value ?? null,
                    unit: rows[0]?.unit || null,
                },
                countries: data,
                requested_countries: codes,
                years: { start: startYear, end: endYear },
            };
        },
    ],
    [
        "list_countries",
        "Look up World Bank country codes, regions, income levels, and capitals. Filter by name or code fragment.",
        {
            query: z
                .string()
                .min(1)
                .max(100)
                .optional()
                .describe(
                    "Match against country name, ISO code, or region, for example Africa or DEU.",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(100)
                .default(20)
                .describe("Maximum number of countries to return."),
        },
        async ({ query, limit }) => {
            const url = new URL(`${API_ROOT}/country`);
            url.search = new URLSearchParams({
                format: "json",
                per_page: "400",
            }).toString();
            const payload = await fetchJson(url, "World Bank countries");
            const rows = payload?.[1];
            if (!Array.isArray(rows)) {
                throw worldBankError(
                    payload,
                    "World Bank rejected the request",
                );
            }
            const needle = query?.toLowerCase();
            const matches = rows.filter((row) => {
                if (!needle) return true;
                return [row.name, row.id, row.iso2Code, row.region?.value]
                    .filter(Boolean)
                    .some((value) => value.toLowerCase().includes(needle));
            });
            return {
                total: matches.length,
                countries: matches.slice(0, limit).map((row) => ({
                    iso3: row.id ?? null,
                    iso2: row.iso2Code ?? null,
                    name: row.name ?? null,
                    region: row.region?.value?.trim() || null,
                    income_level: row.incomeLevel?.value ?? null,
                    capital: row.capitalCity || null,
                    latitude: row.latitude ? Number(row.latitude) : null,
                    longitude: row.longitude ? Number(row.longitude) : null,
                })),
            };
        },
    ],
];
