import { z } from "zod";
import { fetchJson } from "../fetch.js";

// Plain HTTP only — the HTTPS endpoint times out (verified live). The
// Hipolabs Universities API is public, so no key is ever sent upstream.
const API_ROOT = "http://universities.hipolabs.com/search";

export const universitiesTools = [
    [
        "universities_search",
        "Search universities by name. Returns matching universities with their country, domains and web pages. A name with no match returns an empty list. This is a lookup, not a ranking — it does not order or score universities.",
        {
            name: z
                .string()
                .min(1)
                .max(200)
                .describe(
                    "University name or fragment to search for, for example Oxford.",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe("Maximum number of universities to return."),
        },
        async ({ name, limit }) => {
            const term = name.trim();
            if (term.length === 0) {
                throw new Error("Provide a university name.");
            }
            // The handler carries its own default and range check because
            // zod only applies when called through the MCP server.
            const count =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;

            const url = new URL(API_ROOT);
            url.search = new URLSearchParams({
                name: term,
                limit: String(count),
            }).toString();
            // The limit is load-bearing: a broad name without one returns
            // the whole catalog (5,249 records, ~987 KB for "university").
            const payload = await fetchJson(url);
            if (!Array.isArray(payload)) {
                throw new Error(
                    "Universities API returned an unexpected response.",
                );
            }

            // The API reports no match count, so total is the number
            // returned, not the catalog total.
            const universities = payload.slice(0, count).map((row) => ({
                name: row.name ?? null,
                country: row.country ?? null,
                domains: Array.isArray(row.domains) ? row.domains : [],
                web_pages: Array.isArray(row.web_pages) ? row.web_pages : [],
            }));

            return {
                query: term,
                total: universities.length,
                universities,
            };
        },
    ],
];
