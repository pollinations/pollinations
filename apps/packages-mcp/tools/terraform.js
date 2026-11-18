import { z } from "zod";
import { fetchJson } from "../fetch.js";

// Terraform Registry module search: search-only, no detail fetch — the
// detail endpoints run 250+ KB per module while search already carries
// what an agent needs (id, description, downloads, verified flag).
const summary = (data) => ({
    id: data.id,
    namespace: data.namespace,
    name: data.name,
    provider: data.provider,
    version: data.version,
    description: data.description,
    downloads: data.downloads,
    verified: data.verified,
    source: data.source,
    publishedAt: data.published_at,
});
export const terraformTools = [
    [
        "terraform_module_search",
        "Search the Terraform Registry for infrastructure-as-code modules by keyword. Returns at most 25 matches with id, provider, version, description, download count, verified flag, source repository and publish date. Search only — it does not fetch module details. Covers community and verified modules.",
        {
            query: z.string().trim().min(1).max(200),
            limit: z.number().int().min(1).max(25).default(10),
        },
        async ({ query, limit = 10 }) => {
            // Default here too: zod applies the limit default only when
            // args go through the MCP server, so a direct handler call
            // would otherwise send limit=undefined upstream (HTTP 400).
            const url = new URL(
                "https://registry.terraform.io/v1/modules/search",
            );
            url.search = new URLSearchParams({
                q: query,
                limit: String(limit),
            });
            const data = await fetchJson(url);
            if (!Array.isArray(data.modules))
                throw new Error("Invalid Terraform Registry search response");
            return { modules: data.modules.slice(0, limit).map(summary) };
        },
    ],
];
