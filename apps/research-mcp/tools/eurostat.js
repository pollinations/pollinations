// Eurostat dissemination API (demo_pjan): population on 1 January by age and sex.
import { z } from "zod";
import { fetchJson } from "../fetch.js";

const API_ROOT =
    "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/demo_pjan";
const DEFAULT_GEO = "DE";
const DEFAULT_YEAR = 2025;
const SEX_KEYS = { T: "total", M: "male", F: "female" };

// Eurostat geo codes are two-letter country codes or aggregates such as
// EU27_2020, so letters, digits and underscores are allowed.
const geoSchema = z
    .string()
    .regex(/^[A-Za-z0-9_]{2,10}$/)
    .describe(
        "Eurostat country or region code, such as DE, FR or EU27_2020. Defaults to DE.",
    );

const yearSchema = z
    .number()
    .int()
    .min(1960)
    .max(2100)
    .describe(
        "Year of the 1 January population count. Defaults to 2025, the latest year available.",
    );

// JSON-stat stores values in a flat map keyed by a row-major index across the
// dataset's dimensions. Walk the dimensions from last to first, accumulating
// each category's position times the stride of the dimensions after it.
function flatIndex(payload, categories) {
    const ids = payload.id;
    const sizes = payload.size;
    let index = 0;
    let stride = 1;
    for (let i = ids.length - 1; i >= 0; i--) {
        const categoryIndex =
            payload.dimension?.[ids[i]]?.category?.index?.[categories[ids[i]]];
        if (categoryIndex === undefined) return null;
        index += categoryIndex * stride;
        stride *= sizes[i];
    }
    return index;
}

function readValue(payload, index) {
    if (Array.isArray(payload.value)) return payload.value[index] ?? null;
    const raw = payload.value?.[String(index)];
    return typeof raw === "number" ? raw : null;
}

export const eurostatTools = [
    [
        "eurostat_population",
        "Population on 1 January by sex for one Eurostat country or region, from Eurostat's demo_pjan dataset. Defaults to Germany (DE) in 2025, the latest year available. Geo codes are Eurostat codes such as DE, FR or EU27_2020.",
        {
            geo: geoSchema.default(DEFAULT_GEO),
            year: yearSchema.default(DEFAULT_YEAR),
        },
        async ({ geo, year }) => {
            const code = (geo ?? DEFAULT_GEO).toUpperCase();
            const targetYear = year ?? DEFAULT_YEAR;
            if (!/^[A-Z0-9_]{2,10}$/.test(code))
                throw new Error(
                    `geo must be a Eurostat code such as DE or EU27_2020, got ${geo}.`,
                );
            if (
                !Number.isInteger(targetYear) ||
                targetYear < 1960 ||
                targetYear > 2100
            )
                throw new Error(
                    `year must be an integer between 1960 and 2100, got ${year}.`,
                );

            const url = new URL(API_ROOT);
            url.search = new URLSearchParams({
                format: "JSON",
                lang: "en",
                time: String(targetYear),
                geo: code,
                age: "TOTAL",
            }).toString();

            const payload = await fetchJson(url);
            if (
                !payload ||
                typeof payload !== "object" ||
                !payload.dimension ||
                !payload.value ||
                !Array.isArray(payload.id) ||
                !Array.isArray(payload.size)
            )
                throw new Error("Eurostat returned an unexpected response.");

            const population = {};
            for (const [sex, key] of Object.entries(SEX_KEYS)) {
                const index = flatIndex(payload, {
                    freq: "A",
                    unit: "NR",
                    age: "TOTAL",
                    sex,
                    geo: code,
                    time: String(targetYear),
                });
                if (index === null)
                    throw new Error(
                        `No population data for ${code} in ${targetYear}.`,
                    );
                population[key] = readValue(payload, index);
            }

            return {
                geo: code,
                year: targetYear,
                dataset: payload.label ?? null,
                updated: payload.updated ?? null,
                population,
            };
        },
    ],
];
