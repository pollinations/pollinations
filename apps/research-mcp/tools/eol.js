import { z } from "zod";
import { fetchJson } from "../fetch.js";

const API_ROOT = "https://eol.org/api/search/1.0.json";
const MAX_CONTENT = 300;

// The caller's Pollinations key authenticates the proxy. The EOL API is
// public, so the key is never forwarded upstream.

function capContent(content) {
    if (typeof content !== "string" || content.length === 0) return null;
    return content.length > MAX_CONTENT
        ? `${content.slice(0, MAX_CONTENT)}…`
        : content;
}

export const eolTools = [
    [
        "eol_species",
        "Search the Encyclopedia of Life for a species, subspecies or synonym by name. Returns matching pages with their EOL id, title, page link and synonym list. Results mix exact species, subspecies and synonyms in upstream order — the first hit is not necessarily the species itself.",
        {
            query: z
                .string()
                .min(1)
                .max(200)
                .describe(
                    "Species name to search for, for example Panthera leo.",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe("Maximum number of results to return."),
        },
        async ({ query, limit }) => {
            const term = query.trim();
            if (term.length === 0) {
                throw new Error("Provide a search query.");
            }
            const count = Number.isInteger(limit) ? limit : 5;
            if (count < 1 || count > 10) {
                throw new Error("limit must be between 1 and 10.");
            }

            const url = new URL(API_ROOT);
            url.search = new URLSearchParams({ q: term }).toString();
            const payload = await fetchJson(url);
            const results = payload?.results;
            if (!Array.isArray(results)) {
                throw new Error("EOL returned an unexpected response.");
            }

            return {
                query: term,
                total:
                    typeof payload.totalResults === "number"
                        ? payload.totalResults
                        : results.length,
                species: results.slice(0, count).map((row) => ({
                    id: row.id ?? null,
                    title: row.title ?? null,
                    link: row.link ?? null,
                    content: capContent(row.content),
                })),
            };
        },
    ],
];
