import { z } from "zod";
import { fetchJson } from "../fetch.js";

// Ansible Galaxy role search: search-only, no detail fetch — the list
// endpoint already carries what an agent needs (namespace, name,
// description, download count, GitHub repo).
//
// The v1 API silently ignores unknown query params, and `search=` is one
// of them: `?search=nginx` returns the catalog in its default order no
// matter what the term is (verified live — same first results as no
// search at all, even for a nonsense term). The working keyword param is
// `keywords=`; `name=` narrows to exact-name matches instead.
const summary = (data) => {
    const description =
        typeof data.description === "string" ? data.description : "";
    return {
        id: data.id,
        username: data.username,
        name: data.name,
        description:
            description.length > 300
                ? `${description.slice(0, 300)}…`
                : description,
        downloadCount: data.download_count,
        githubUrl:
            data.github_user && data.github_repo
                ? `https://github.com/${data.github_user}/${data.github_repo}`
                : null,
        created: data.created,
    };
};
export const ansibleGalaxyTools = [
    [
        "ansible_galaxy_roles",
        "Search Ansible Galaxy for community Ansible roles by keyword. Returns at most 25 matches with namespace, name, description, download count, GitHub repository URL and creation date, plus the total match count. Search only — it does not fetch role details. Covers community roles, not collections.",
        {
            search: z.string().trim().min(1).max(200),
            limit: z.number().int().min(1).max(25).default(5),
        },
        async ({ search, limit = 5 }) => {
            // Default here too: zod applies the limit default only when
            // args go through the MCP server, so a direct handler call
            // would otherwise send limit=undefined upstream (HTTP 400).
            const url = new URL("https://galaxy.ansible.com/api/v1/roles/");
            url.search = new URLSearchParams({
                keywords: search,
                page_size: String(limit),
            });
            const data = await fetchJson(url);
            if (!Array.isArray(data.results))
                throw new Error("Invalid Ansible Galaxy search response");
            return {
                total: data.count,
                roles: data.results.slice(0, limit).map(summary),
            };
        },
    ],
];
