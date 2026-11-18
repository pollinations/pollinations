import { z } from "zod";
import { fetchJson } from "../fetch.js";

const API_ROOT = "https://www.osti.gov/api/v1/records";
const MAX_DESCRIPTION = 400;

// The caller's Pollinations key authenticates the proxy. The OSTI API is
// public, so the key is never forwarded upstream.
//
// OSTI negotiates on Accept: without application/json it answers XML, so
// this tool must go through fetchJson (which sends Accept: application/json),
// never a bare fetch.

function capDescription(description) {
    if (typeof description !== "string" || description.length === 0)
        return null;
    return description.length > MAX_DESCRIPTION
        ? `${description.slice(0, MAX_DESCRIPTION)}…`
        : description;
}

// Author strings sometimes carry an affiliation in brackets
// ("Hickmon, N. [Argonne National Lab. (ANL), ...]") — keep the name only.
function authorName(author) {
    if (typeof author !== "string") return null;
    const bracket = author.indexOf(" [");
    return bracket === -1 ? author : author.slice(0, bracket);
}

export const ostiTools = [
    [
        "osti_search",
        "Search the U.S. Department of Energy's OSTI records for science and technology reports, papers and datasets by keyword. Returns matching records with their OSTI id, title, DOI, publication date, a short description and author names.",
        {
            query: z
                .string()
                .min(1)
                .max(200)
                .describe(
                    "Keyword to search for, for example climate or fusion.",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(3)
                .default(2)
                .describe("Maximum number of records to return."),
        },
        async ({ query, limit }) => {
            const term = query.trim();
            if (term.length === 0) {
                throw new Error("Provide a search query.");
            }
            const count = Number.isInteger(limit) ? limit : 2;
            if (count < 1 || count > 3) {
                throw new Error("limit must be between 1 and 3.");
            }

            const url = new URL(API_ROOT);
            url.search = new URLSearchParams({
                q: term,
                rows: String(count),
            }).toString();
            const payload = await fetchJson(url);
            if (!Array.isArray(payload)) {
                throw new Error("OSTI returned an unexpected response.");
            }

            return {
                query: term,
                total: payload.length,
                records: payload.slice(0, count).map((row) => ({
                    osti_id: row.osti_id ?? null,
                    title: row.title ?? null,
                    doi: row.doi ?? null,
                    publication_date: row.publication_date ?? null,
                    description: capDescription(row.description),
                    authors: Array.isArray(row.authors)
                        ? row.authors.map(authorName).filter(Boolean)
                        : [],
                })),
            };
        },
    ],
];
