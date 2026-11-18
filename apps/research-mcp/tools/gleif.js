import { z } from "zod";

const API_ROOT = "https://api.gleif.org/api/v1/lei-records";
const LEI_PATTERN = /^[0-9A-Z]{20}$/;

// GLEIF's name filter is a loose substring match, not a ranking: "Apple"
// returns APPLE TREE and APPLE IMPRESSION before Apple Inc., which does not
// even appear in the first ten of 379 matches. Within the fetched page,
// surface an exact name match first, then prefix matches, then the rest in
// the upstream order — it cannot rescue a match that is not on the page.
function rankRecords(records, query) {
    const wanted = query.toLowerCase();
    const score = (name) => {
        const lower = String(name ?? "").toLowerCase();
        if (lower === wanted) return 0;
        if (lower.startsWith(wanted)) return 1;
        return 2;
    };
    return [...records].sort(
        (a, b) => score(a.legal_name) - score(b.legal_name),
    );
}

function formatRecord(record) {
    const attributes = record?.attributes ?? {};
    const entity = attributes.entity ?? {};
    const name = entity.legalName?.name ?? null;
    const address = entity.legalAddress ?? {};
    return {
        lei: attributes.lei ?? record?.id ?? null,
        legal_name: name,
        city: address.city ?? null,
        region: address.region ?? null,
        country: address.country ?? null,
        postal_code: address.postalCode ?? null,
        status: entity.status ?? null,
    };
}

export const gleifTools = [
    [
        "lei_lookup",
        "Look up legal entities in the GLEIF Legal Entity Identifier registry by legal name or exact LEI: LEI, legal name, city, region, country, postal code and entity status. The name search is a loose substring match, so use the full legal name or the exact LEI for a specific company.",
        {
            name: z
                .string()
                .min(1)
                .max(200)
                .optional()
                .describe(
                    "Legal name to search for (e.g. 'APPLE INC'). Loose substring match — the first results are not necessarily the best-known company.",
                ),
            lei: z
                .string()
                .min(1)
                .max(20)
                .optional()
                .describe(
                    "Exact 20-character LEI (e.g. 'HWUPKR0MPOU8FGXBT394' for Apple Inc.). Precise — use this when the LEI is known.",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe(
                    "Maximum number of results to return for a name search (1-10, default 5)",
                ),
        },
        async ({ name, lei, limit }, fetchJson) => {
            const cleanName = String(name ?? "").trim();
            const cleanLei = String(lei ?? "")
                .trim()
                .toUpperCase();
            if (!cleanName && !cleanLei)
                throw new Error("Provide a legal name or an LEI.");
            const cleanLimit =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            if (cleanLei) {
                if (!LEI_PATTERN.test(cleanLei))
                    throw new Error(
                        "An LEI is 20 uppercase letters and digits.",
                    );
                let data;
                try {
                    data = await fetchJson(`${API_ROOT}/${cleanLei}`);
                } catch (error) {
                    if (String(error?.message ?? "").includes("HTTP 404"))
                        throw new Error(`No LEI record found for ${cleanLei}.`);
                    throw error;
                }
                const record = data?.data;
                if (!record || typeof record !== "object")
                    throw new Error("Unexpected response from GLEIF.");
                return {
                    total: 1,
                    query: cleanLei,
                    records: [formatRecord(record)],
                };
            }
            const url = `${API_ROOT}?filter[entity.legalName]=${encodeURIComponent(cleanName)}&page[size]=${cleanLimit}`;
            const data = await fetchJson(url);
            const records = data?.data;
            if (!Array.isArray(records))
                throw new Error("Unexpected response from GLEIF.");
            return {
                total: data?.meta?.pagination?.total ?? records.length,
                query: cleanName,
                records: rankRecords(records.map(formatRecord), cleanName),
            };
        },
    ],
];
