import { z } from "zod";

// GBIF's public API needs no key; the backbone taxonomy is CC BY 4.0.
const API_ROOT = "https://api.gbif.org/v1";
const RANKS = [
    "kingdom",
    "phylum",
    "class",
    "order",
    "family",
    "genus",
    "species",
];

export const gbifTools = [
    [
        "gbif_species",
        "Match a scientific name (genus, species or other taxon, typos tolerated) against the GBIF backbone taxonomy. Returns the matched name, rank, accepted classification, English common names, the number of GBIF occurrence records and the GBIF page. Synonyms resolve to their accepted taxon. Common names are not matched; translate them to a scientific name first.",
        {
            name: z
                .string()
                .trim()
                .min(2)
                .max(200)
                .describe(
                    "Scientific name such as `Puma concolor` or `Quercus`",
                ),
        },
        async ({ name }, fetchJson) => {
            const match = await fetchJson(
                `${API_ROOT}/species/match?name=${encodeURIComponent(name)}`,
            );
            if (match.matchType === "NONE")
                throw new Error(
                    `No GBIF backbone match for "${name}"; use a scientific name`,
                );
            const key = match.acceptedUsageKey ?? match.usageKey;
            const [occurrences, vernacular] = await Promise.all([
                fetchJson(`${API_ROOT}/occurrence/count?taxonKey=${key}`),
                fetchJson(
                    `${API_ROOT}/species/${key}/vernacularNames?limit=100`,
                ),
            ]);
            return {
                key,
                matchedName: match.scientificName,
                matchType: match.matchType,
                confidence: match.confidence,
                status: match.status,
                rank: match.rank,
                classification: Object.fromEntries(
                    RANKS.filter((rank) => match[rank]).map((rank) => [
                        rank,
                        match[rank],
                    ]),
                ),
                englishNames: [
                    ...new Set(
                        vernacular.results
                            .filter((v) => v.language === "eng")
                            .map((v) => v.vernacularName),
                    ),
                ].slice(0, 10),
                occurrences,
                url: `https://www.gbif.org/species/${key}`,
            };
        },
    ],
];
