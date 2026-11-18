import { z } from "zod";

const API_ROOT = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync";
const COLUMNS =
    "pl_name,hostname,disc_year,sy_dist,pl_orbper,pl_rade,pl_bmasse";

// The `ps` table holds several rows per planet (one per published parameter
// set), so the tool asks for distinct rows, over-fetches, and dedupes by
// planet name client-side — otherwise a 5-result answer could be the same
// planet five times.
function toNumber(value) {
    if (value === null || value === undefined) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function formatPlanet(row) {
    return {
        name: row.pl_name ?? null,
        host_star: row.hostname ?? null,
        discovery_year: row.disc_year ?? null,
        distance_pc: toNumber(row.sy_dist),
        orbital_period_days: toNumber(row.pl_orbper),
        radius_earth: toNumber(row.pl_rade),
        mass_earth: toNumber(row.pl_bmasse),
    };
}

// ADQL LIKE is case-sensitive, so the tool matches on upper(pl_name) with an
// upper-cased term. Single quotes are doubled (the ADQL escape) and the LIKE
// wildcards % and _ are backslash-escaped, with `escape '\'` on the clause,
// so a term can never inject ADQL or match more than its literal text.
function likePattern(term) {
    const escaped = term
        .toUpperCase()
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "''")
        .replace(/%/g, "\\%")
        .replace(/_/g, "\\_");
    return `upper(pl_name) like '%${escaped}%' escape '\\'`;
}

export const exoplanetTools = [
    [
        "exoplanet_search",
        "Search the NASA Exoplanet Archive for confirmed exoplanets by planet-name substring (e.g. 'Kepler', 'TRAPPIST-1'). Returns planet name, host star, discovery year, distance in parsecs, orbital period, radius and mass where known.",
        {
            name: z
                .string()
                .min(1)
                .max(200)
                .describe(
                    "Planet-name substring to search for (e.g. 'Kepler', 'TRAPPIST-1'). Matching is case-insensitive.",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe(
                    "Maximum number of planets to return (1-10, default 5)",
                ),
        },
        async ({ name, limit }, fetchJson) => {
            const term = name.trim();
            if (!term) throw new Error("Planet name must not be empty.");
            const safeLimit =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const pattern = likePattern(term);
            const fetchN = Math.min(safeLimit * 5, 50);
            const rowsUrl = `${API_ROOT}?query=${encodeURIComponent(`select distinct top ${fetchN} ${COLUMNS} from ps where ${pattern}`)}&format=json`;
            const countUrl = `${API_ROOT}?query=${encodeURIComponent(`select count(distinct pl_name) as n from ps where ${pattern}`)}&format=json`;
            const [rows, count] = await Promise.all([
                fetchJson(rowsUrl),
                fetchJson(countUrl),
            ]);
            if (!Array.isArray(rows))
                throw new Error("Unexpected Exoplanet Archive response.");
            const seen = new Set();
            const planets = [];
            for (const row of rows) {
                const planet = formatPlanet(row);
                if (!planet.name || seen.has(planet.name)) continue;
                seen.add(planet.name);
                planets.push(planet);
                if (planets.length >= safeLimit) break;
            }
            const total =
                Array.isArray(count) &&
                count[0] &&
                Number.isFinite(Number(count[0].n))
                    ? Number(count[0].n)
                    : planets.length;
            return { query: term, total, planets };
        },
    ],
];
