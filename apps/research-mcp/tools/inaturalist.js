import { z } from "zod";

const query = z.string().trim().min(1).max(200);
const limit = z.number().int().min(1).max(10).default(5);

export const inaturalistTools = [
    [
        "inaturalist_taxon",
        "Look up a taxon on iNaturalist by name. Returns matching taxa with id, name, rank, iconic taxon id, extinct flag and a photo URL. Results mix ranks — one name can match a genus and a species — so read `rank`. Taxonomy from community observations, not an occurrence search. No key needed.",
        {
            query,
            limit,
        },
        async ({ query, limit = 5 }, fetchJson) => {
            const q = typeof query === "string" ? query.trim() : "";
            if (!q) throw new Error("Provide a taxon name to look up.");
            const n =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const data = await fetchJson(
                `https://api.inaturalist.org/v1/taxa?${new URLSearchParams({ q, per_page: String(n) })}`,
            );
            if (!Array.isArray(data.results))
                throw new Error("iNaturalist returned an unexpected response.");
            return {
                query: q,
                total: data.total_results ?? data.results.length,
                taxa: data.results.map((taxon) => ({
                    id: taxon.id,
                    name: taxon.name,
                    rank: taxon.rank,
                    iconic_taxon_id: taxon.iconic_taxon_id ?? null,
                    extinct: taxon.extinct ?? false,
                    photo_url: taxon.default_photo?.medium_url ?? null,
                })),
            };
        },
    ],
];
