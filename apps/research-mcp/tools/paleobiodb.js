import { z } from "zod";

// PaleoBioDB rank codes, verified live against the taxa list endpoint:
// 3 species, 5 genus, 8 subfamily, 9 family, 13 order, 17 class,
// 20 phylum, 23 kingdom. Any other code is returned as rank_code only.
const RANK_NAMES = {
    3: "species",
    5: "genus",
    8: "subfamily",
    9: "family",
    13: "order",
    17: "class",
    20: "phylum",
    23: "kingdom",
};

const name = z.string().trim().min(1).max(200);

export const paleobiodbTools = [
    [
        "paleobiodb_taxon",
        "Look up a taxon in the Paleobiology Database by exact scientific name. Returns the authority, rank, parent, child count and whether it is extant. Fossil record, not living species.",
        {
            name,
            limit: z.number().int().min(1).max(10).default(5),
        },
        async ({ name, limit }, fetchJson) => {
            const trimmed = name.trim();
            if (!trimmed) throw new Error("Taxon name must not be empty.");
            const safeLimit =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const data = await fetchJson(
                `https://paleobiodb.org/data1.2/taxa/list.json?${new URLSearchParams({ name: trimmed, show: "attr" })}`,
            );
            if (!Array.isArray(data.records))
                throw new Error("Unexpected PaleoBioDB response.");
            const taxa = data.records.slice(0, safeLimit).map((record) => ({
                name: record.nam,
                authority: record.att ?? null,
                rank: RANK_NAMES[record.rnk] ?? null,
                rank_code: record.rnk ?? null,
                taxon_id: record.oid ?? null,
                parent_id: record.par ?? null,
                child_count: typeof record.noc === "number" ? record.noc : null,
                extant:
                    record.ext === "1"
                        ? true
                        : record.ext === "0"
                          ? false
                          : null,
            }));
            return { query: trimmed, total: data.records.length, taxa };
        },
    ],
];
