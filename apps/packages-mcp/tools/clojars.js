import { z } from "zod";
import { fetchJson } from "../fetch.js";

// Clojars search: search-only, no detail fetch — the per-artifact detail
// endpoint answers 404, so there is nothing useful to fetch after search.
// The search endpoint always returns the first page of 24 results: it
// silently ignores both `limit` and `offset` params, so the tool slices
// client-side and caps `limit` at 24 instead of promising 25.
const summary = (data) => ({
    group: data.group_name,
    jar: data.jar_name,
    version: data.version,
    description: (data.description ?? "").slice(0, 300),
    descriptionTruncated: (data.description ?? "").length > 300,
});
export const clojarsTools = [
    [
        "clojars_search",
        "Search Clojars for Clojure libraries by keyword. Returns at most 24 matches with group, jar name, version and description, plus the total number of matches. Search only — it does not fetch per-artifact details. Niche audience: Clojure developers.",
        {
            query: z.string().trim().min(1).max(200),
            limit: z.number().int().min(1).max(24).default(5),
        },
        async ({ query, limit = 5 }) => {
            // Default here too: zod applies the limit default only when
            // args go through the MCP server, so a direct handler call
            // would otherwise send limit=undefined upstream. Validate
            // here as well: the search page is fixed at 24 results, so a
            // limit above 24 could never be honoured.
            if (limit < 1 || limit > 24)
                throw new Error("limit must be between 1 and 24");
            const url = new URL("https://clojars.org/search");
            url.search = new URLSearchParams({
                q: query,
                format: "json",
            });
            const data = await fetchJson(url);
            if (!Array.isArray(data.results))
                throw new Error("Invalid Clojars search response");
            return {
                total: data["total-hits"] ?? data.results.length,
                packages: data.results.slice(0, limit).map(summary),
            };
        },
    ],
];
