import { z } from "zod";

const API_ROOT = "https://api.usaspending.gov/api/v2/agency";
const CODE_PATTERN = /^\d{3}$/;

// Toptier codes for the ten best-known agencies, each verified live against
// the API. Any other 3-digit code also works — it is passed through as-is —
// but only these names are mapped, so an agent that knows a name can ask by
// name instead of having to look the code up first.
const AGENCY_CODES = {
    "012": ["usda", "department of agriculture", "agriculture"],
    "014": ["doi", "department of the interior", "interior"],
    "019": ["dos", "department of state", "state"],
    "020": ["treas", "department of the treasury", "treasury"],
    "069": ["dot", "department of transportation", "transportation"],
    "073": ["sba", "small business administration"],
    "075": [
        "hhs",
        "department of health and human services",
        "health and human services",
    ],
    "080": ["nasa", "national aeronautics and space administration"],
    "086": [
        "hud",
        "department of housing and urban development",
        "housing and urban development",
    ],
    "097": ["dod", "department of defense", "defense"],
};

const NAME_TO_CODE = {};
for (const [code, names] of Object.entries(AGENCY_CODES)) {
    for (const name of names) NAME_TO_CODE[name] = code;
}

const KNOWN_NAMES = Object.values(AGENCY_CODES)
    .flat()
    .map((name) => name.toUpperCase())
    .sort()
    .join(", ");

function resolveCode(agency) {
    const clean = String(agency ?? "").trim();
    if (CODE_PATTERN.test(clean)) return clean;
    const code = NAME_TO_CODE[clean.toLowerCase()];
    if (code) return code;
    throw new Error(
        `Unknown agency ${clean}. Give a 3-digit toptier code (e.g. 073) or one of: ${KNOWN_NAMES}.`,
    );
}

export const usaspendingTools = [
    [
        "agency_overview",
        "Look up a US federal agency on USAspending.gov: name, abbreviation, mission, website and subtier agency count for a fiscal year. Give a 3-digit toptier code (e.g. '073') or the name of a well-known agency (e.g. 'NASA', 'SBA'); any other 3-digit code works too. One fetch per call; an unknown code is a clean error, not an empty result.",
        {
            agency: z
                .string()
                .min(1)
                .max(100)
                .describe(
                    "A 3-digit toptier code (e.g. '073') or the name/abbreviation of a well-known agency (e.g. 'NASA', 'SBA', 'USDA').",
                ),
            fiscal_year: z
                .number()
                .int()
                .min(2000)
                .max(2030)
                .optional()
                .describe(
                    "Fiscal year (e.g. 2026). Defaults to the current fiscal year when omitted.",
                ),
        },
        async ({ agency, fiscal_year }, fetchJson) => {
            const code = resolveCode(agency);
            const year =
                fiscal_year === undefined ? undefined : Number(fiscal_year);
            if (
                year !== undefined &&
                (!Number.isInteger(year) || year < 2000 || year > 2030)
            )
                throw new Error(
                    "fiscal_year must be a year between 2000 and 2030.",
                );
            const url =
                year === undefined
                    ? `${API_ROOT}/${code}/`
                    : `${API_ROOT}/${code}/?fiscal_year=${year}`;
            let data;
            try {
                data = await fetchJson(url);
            } catch (error) {
                if (String(error?.message ?? "").includes("HTTP 404"))
                    throw new Error(
                        `No agency found with toptier code ${code}.`,
                    );
                throw error;
            }
            if (
                typeof data?.fiscal_year !== "number" ||
                typeof data?.toptier_code !== "string" ||
                typeof data?.name !== "string"
            )
                throw new Error("Unexpected response from USAspending.");
            return {
                fiscal_year: data.fiscal_year,
                toptier_code: data.toptier_code,
                name: data.name,
                abbreviation: data.abbreviation ?? null,
                mission: data.mission ?? null,
                website: data.website ?? null,
                subtier_agency_count: data.subtier_agency_count ?? null,
            };
        },
    ],
];
