import { z } from "zod";
import { fetchJson } from "../fetch.js";

// JetBrains Marketplace plugin search: search-only, no detail fetch —
// the search payload already carries what an agent needs (name,
// description, vendor, rating, downloads, pricing model, tags).
// Two upstream quirks, both verified live: the documented `query=`
// param is silently ignored (any term, even nonsense, returns the
// same default top-10 list), and `pageSize` is ignored too — the
// endpoint always answers 10 plugins. The working param is `search=`,
// and the tool slices client-side to `limit`.
const summary = (data) => ({
    id: data.id,
    xmlId: data.xmlId,
    name: data.name,
    description:
        typeof data.preview === "string" && data.preview.length > 500
            ? `${data.preview.slice(0, 500)}…`
            : (data.preview ?? null),
    vendor: data.vendor?.name ?? null,
    vendorVerified: data.vendor?.isVerified ?? false,
    rating: typeof data.rating === "number" ? data.rating : null,
    downloads: data.downloads ?? null,
    pricingModel: data.pricingModel ?? null,
    tags: Array.isArray(data.tags) ? data.tags.slice(0, 5) : [],
    url: `https://plugins.jetbrains.com${data.link}`,
});
export const jetbrainsTools = [
    [
        "jetbrains_plugins",
        "Search the JetBrains Marketplace for IDE plugins by keyword. Returns at most 25 matches with name, description, vendor, rating, download count, pricing model, tags and plugin URL, plus the total match count. Search only — the API carries no version information, so there is no latest-version lookup. Covers IntelliJ IDEA, PyCharm, WebStorm and other JetBrains IDEs.",
        {
            query: z.string().trim().min(1).max(200),
            limit: z.number().int().min(1).max(25).default(5),
        },
        async ({ query, limit = 5 }) => {
            // Default here too: zod applies the limit default only when
            // args go through the MCP server, so a direct handler call
            // would otherwise send limit=undefined upstream.
            const trimmed = typeof query === "string" ? query.trim() : "";
            if (!trimmed) throw new Error("Query must not be empty");
            if (!Number.isInteger(limit) || limit < 1 || limit > 25)
                throw new Error("Limit must be between 1 and 25");
            const url = new URL(
                "https://plugins.jetbrains.com/api/searchPlugins",
            );
            url.search = new URLSearchParams({ search: trimmed });
            const data = await fetchJson(url);
            if (!Array.isArray(data.plugins))
                throw new Error(
                    "Invalid JetBrains Marketplace search response",
                );
            return {
                total:
                    typeof data.total === "number"
                        ? data.total
                        : data.plugins.length,
                plugins: data.plugins.slice(0, limit).map(summary),
            };
        },
    ],
];
