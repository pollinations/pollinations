import { z } from "zod";
import { fetchJson } from "../fetch.js";

const API_ROOT =
    "https://www.itis.gov/ITISWebService/jsonservice/searchByScientificName";

// ITIS carries no rank field: a record's rank follows from how many name
// parts it has — one part is a genus, two a species, three a subspecies,
// four a variety.
const RANKS = { 1: "genus", 2: "species", 3: "subspecies", 4: "variety" };

function rankOf(record) {
    const parts = [
        record.unitName1,
        record.unitName2,
        record.unitName3,
        record.unitName4,
    ].filter((part) => part != null && part !== "");
    return RANKS[parts.length] ?? null;
}

function taxonSummary(record) {
    return {
        tsn: record.tsn ?? null,
        combined_name: record.combinedName ?? null,
        author: record.author ?? null,
        kingdom: record.kingdom ?? null,
        rank: rankOf(record),
    };
}

export const itisTools = [
    [
        "itis_taxon",
        "Look up a scientific name in ITIS, the authoritative US taxonomy database, and get its Taxonomic Serial Number (TSN), author, kingdom and rank. For example Panthera leo is TSN 183803. A name with no match returns an empty list, not an error.",
        {
            name: z
                .string()
                .min(1)
                .max(200)
                .describe(
                    "Scientific name, for example Panthera leo or Panthera.",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe("Maximum number of matching taxa to return."),
        },
        async ({ name, limit }) => {
            const trimmed = name.trim();
            if (!trimmed) throw new Error("Name must not be blank.");
            const safeLimit =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const url = new URL(API_ROOT);
            url.searchParams.set("srchKey", trimmed);
            const data = await fetchJson(url);
            const records = data?.scientificNames;
            if (!Array.isArray(records))
                throw new Error("Unexpected ITIS response.");
            return {
                query: trimmed,
                total: records.length,
                taxa: records.slice(0, safeLimit).map(taxonSummary),
            };
        },
    ],
];
