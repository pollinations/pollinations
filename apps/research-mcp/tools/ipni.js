import { z } from "zod";

const API_ROOT = "https://www.ipni.org/api/1/search";

// IPNI mixes record types in one search: plant names are `citation`,
// publications are `publication`, people are `author`. Only citations are
// plant names, so the rest are filtered out client-side — there is no
// server-side recordType filter (a `recordType=` param is silently ignored).
function nameSummary(record) {
    return {
        id: record.id ?? null,
        name: record.name ?? null,
        authors: record.authors ?? null,
        family: record.family ?? null,
        genus: record.genus ?? null,
        species: record.species ?? null,
        rank: record.rank ?? null,
        publication: record.publication ?? null,
        publication_year: record.publicationYear ?? null,
        url: record.url ? `https://www.ipni.org${record.url}` : null,
    };
}

export const ipniTools = [
    [
        "ipni_name",
        "Search the International Plant Names Index for plant names. Returns the name, authors, family, genus, species, rank, and the publication it was described in. Works best with a full name such as Rosa canina — a bare genus mostly matches publications and authors upstream, not names.",
        {
            query: z
                .string()
                .min(1)
                .max(200)
                .describe(
                    "Plant name, for example Rosa canina or Quercus robur.",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe("Maximum number of names to return."),
        },
        async ({ query, limit }, fetchJson) => {
            const trimmed = query.trim();
            if (!trimmed) throw new Error("Query must not be empty.");
            const safeLimit =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            // Over-fetch: one page mixes citations with publications and
            // authors, so asking for `limit` rows can return zero names.
            const perPage = Math.min(safeLimit * 5, 50);
            const url = new URL(API_ROOT);
            url.searchParams.set("q", trimmed);
            url.searchParams.set("perPage", String(perPage));
            const data = await fetchJson(url);
            // A no-match answer carries no `results` key at all, so a
            // missing array with totalResults 0 is an empty list, not an
            // error.
            const results =
                data?.results ?? (data?.totalResults === 0 ? [] : undefined);
            if (!Array.isArray(results)) {
                throw new Error(
                    "IPNI returned an unexpected response; try again later.",
                );
            }
            const names = results
                .filter(
                    (record) =>
                        record.recordType === "citation" &&
                        typeof record.name === "string",
                )
                .map(nameSummary);
            return {
                query: trimmed,
                total: names.length,
                names: names.slice(0, safeLimit),
            };
        },
    ],
];
