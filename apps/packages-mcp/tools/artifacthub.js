// Artifact Hub Helm chart search. No key; the search API is public.
import { z } from "zod";
import { fetchJson } from "../fetch.js";

const API_ROOT = "https://artifacthub.io/api/v1/packages/search";

// kind=0 is Helm charts only; other kinds (Falco rules, OPA policies, …)
// are out of scope for this tool.
const KIND_HELM = 0;

function summary(pkg) {
    const description = pkg.description ?? null;
    return {
        name: pkg.name,
        normalized_name: pkg.normalized_name,
        description:
            typeof description === "string" ? description.slice(0, 300) : null,
        descriptionTruncated:
            typeof description === "string" && description.length > 300,
        stars: pkg.stars ?? null,
        version: pkg.version ?? null,
        category: pkg.category_display_name ?? null,
        repository: pkg.repository?.display_name ?? pkg.repository?.name,
        repository_url: pkg.repository?.url ?? null,
    };
}

export const artifactHubTools = [
    [
        "artifacthub_search",
        "Search Artifact Hub for Helm charts by keyword. Returns matching charts with name, description, stars, version, category and repository. Helm charts only (kind=0); search-only, no chart detail lookup. No key needed.",
        {
            query: z.string().trim().min(1).max(200),
            limit: z.number().int().min(1).max(25).optional(),
        },
        async ({ query, limit = 5 }) => {
            const q = typeof query === "string" ? query.trim() : "";
            if (!q) throw new Error("query must not be empty");
            if (!Number.isInteger(limit) || limit < 1 || limit > 25)
                throw new Error("limit must be an integer between 1 and 25");
            const url = new URL(API_ROOT);
            url.search = new URLSearchParams({
                ts_query_web: q,
                kind: String(KIND_HELM),
                limit: String(limit),
            });
            const data = await fetchJson(url);
            if (!data || !Array.isArray(data.packages))
                throw new Error("Invalid Artifact Hub search response");
            const packages = data.packages.slice(0, limit).map(summary);
            return { total: packages.length, packages };
        },
    ],
];
