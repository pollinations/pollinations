// WoRMS marine species lookup. Keyless, one fetch per call.
// A name with no match answers HTTP 204 with an empty body, not a 404, so
// the handler treats an empty response as an empty result. The lookup is
// exact-name only: the API's like=true form returns 50 records and ~47 KB
// of mostly synonyms for a single genus, so it is pinned off.
import { z } from "zod";
import { fetchText } from "../fetch.js";

const API = "https://www.marinespecies.org/rest/AphiaRecordsByName";

const isMarine = (value) => (value === 1 ? true : value === 0 ? false : null);

const projectRecord = (record) => ({
    name: record.scientificname ?? null,
    authority: record.authority ?? null,
    status: record.status ?? null,
    rank: record.rank ?? null,
    aphia_id: record.AphiaID ?? null,
    valid_name: record.valid_name ?? null,
    valid_authority: record.valid_authority ?? null,
    kingdom: record.kingdom ?? null,
    phylum: record.phylum ?? null,
    class: record.class ?? null,
    order: record.order ?? null,
    family: record.family ?? null,
    genus: record.genus ?? null,
    is_marine: isMarine(record.isMarine),
    url: record.url ?? null,
});

export const wormsTools = [
    [
        "worms_species",
        "Look up a marine species in the World Register of Marine Species (WoRMS) by exact scientific name: status, rank, AphiaID and the full taxonomic hierarchy. For example Delphinus (the common dolphin genus).",
        {
            name: z
                .string()
                .trim()
                .min(1)
                .max(200)
                .describe(
                    "Exact scientific name, such as Delphinus or Delphinus delphis.",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe("Maximum records to return (1-10, default 5)."),
        },
        async ({ name, limit }) => {
            const query = String(name ?? "").trim();
            if (!query) throw new Error("Provide a scientific name.");
            const count =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const text = await fetchText(
                `${API}/${encodeURIComponent(query)}?like=false&marine_only=true`,
            );
            if (!text.trim()) return { query, total: 0, species: [] };
            let data;
            try {
                data = JSON.parse(text);
            } catch {
                throw new Error("Unexpected WoRMS response; try again later.");
            }
            if (!Array.isArray(data))
                throw new Error("Unexpected WoRMS response; try again later.");
            return {
                query,
                total: data.length,
                species: data.slice(0, count).map(projectRecord),
            };
        },
    ],
];
