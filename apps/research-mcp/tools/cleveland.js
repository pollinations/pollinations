// Cleveland Museum of Art artworks search. One fetch per call; the
// `fields` param is load-bearing — without it the same query returns
// ~62 KB per two records, with it ~0.7 KB — so it is always sent.
import { z } from "zod";

const API_ROOT = "https://openaccess-api.clevelandart.org/api/artworks/";
const FIELDS = "id,title,creation_date,technique,department";

function normalizeLimit(limit) {
    if (limit === undefined || limit === null) return 5;
    const n = Number(limit);
    if (!Number.isInteger(n) || n < 1 || n > 10)
        throw new Error("Provide a limit between 1 and 10.");
    return n;
}

function projectArtwork(item) {
    return {
        id: item.id ?? null,
        title: item.title ?? null,
        creation_date: item.creation_date ?? null,
        technique: item.technique ?? null,
        department: item.department ?? null,
    };
}

export const clevelandTools = [
    [
        "cleveland_artwork",
        'Search artworks in the Cleveland Museum of Art\'s open-access collection by keyword (for example monet): title, creation date, technique and department for each match. The creation date is a free-text string like "c. 1868–73", not a date.',
        {
            query: z
                .string()
                .min(1)
                .max(200)
                .describe("Search term for the artwork title or description."),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .optional()
                .describe("How many matches to return, 1 to 10, default 5."),
        },
        async ({ query, limit }, fetchJson) => {
            const cleanQuery = String(query).trim();
            if (!cleanQuery) throw new Error("Provide a search term.");
            const cleanLimit = normalizeLimit(limit);
            const params = new URLSearchParams({
                q: cleanQuery,
                limit: String(cleanLimit),
                fields: FIELDS,
            });
            const data = await fetchJson(`${API_ROOT}?${params}`);
            if (
                typeof data !== "object" ||
                data === null ||
                !Array.isArray(data.data)
            )
                throw new Error(
                    "Cleveland Museum of Art returned an unexpected response.",
                );
            return {
                query: cleanQuery,
                total: data.info?.total ?? data.data.length,
                artworks: data.data.slice(0, cleanLimit).map(projectArtwork),
            };
        },
    ],
];
