import { z } from "zod";
import { fetchJson } from "../fetch.js";

const API_ROOT = "https://api.obis.org/v3/taxon";

// The caller's Pollinations key authenticates the proxy. The OBIS API is
// public, so the key is never forwarded upstream.

export const obisTools = [
    [
        "obis_taxon",
        "Look up a marine taxon in the Ocean Biodiversity Information System (OBIS) by scientific name. Returns the taxon record with its accepted name, rank, status, OBIS taxon ID, NCBI id, marine/terrestrial flags and the kingdom-to-species hierarchy. A name with no match returns an empty list. This is a taxon lookup, not an occurrence search — it does not return sighting records.",
        {
            name: z
                .string()
                .min(1)
                .max(200)
                .describe(
                    "Scientific name to look up, for example Delphinus delphis.",
                ),
        },
        async ({ name }) => {
            const term = name.trim();
            if (term.length === 0) {
                throw new Error("Provide a scientific name.");
            }

            const url = `${API_ROOT}/${encodeURIComponent(term)}`;
            const payload = await fetchJson(url);
            const results = payload?.results;
            if (!Array.isArray(results)) {
                throw new Error("OBIS returned an unexpected response.");
            }

            return {
                name: term,
                total:
                    typeof payload.total === "number"
                        ? payload.total
                        : results.length,
                taxa: results.map((row) => ({
                    scientificName: row.scientificName ?? null,
                    authorship: row.scientificNameAuthorship ?? null,
                    taxonID: row.taxonID ?? null,
                    ncbiId: row.ncbi_id ?? null,
                    rank: row.taxonRank ?? null,
                    status: row.taxonomicStatus ?? null,
                    acceptedName: row.acceptedNameUsage ?? null,
                    isMarine: row.is_marine ?? null,
                    isTerrestrial: row.is_terrestrial ?? null,
                    kingdom: row.kingdom ?? null,
                    phylum: row.phylum ?? null,
                    class: row.class ?? null,
                    order: row.order ?? null,
                    family: row.family ?? null,
                    genus: row.genus ?? null,
                    species: row.species ?? null,
                })),
            };
        },
    ],
];
