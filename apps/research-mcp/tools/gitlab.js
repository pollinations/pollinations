import { z } from "zod";

const API_ROOT = "https://gitlab.com/api/v4/projects";
const DESCRIPTION_LIMIT = 500;

// GitLab's project search matches name, path and description — never code —
// and it is fuzzy: a keyboard-mash term still matches path fragments, while
// a term with no matches at all answers HTTP 500 after ~16 s (verified live
// three times: zzzzqqqxxyy twice, blorptastic once). The 500 is rewritten
// below into a plain-language error; in production the shared fetch layer
// aborts at 10 s first, so a no-match term surfaces as a timeout instead.
function formatProject(item) {
    const description = item.description
        ? String(item.description).trim()
        : null;
    return {
        name: item.name ?? null,
        namespace: item.name_with_namespace ?? null,
        description:
            description && description.length > DESCRIPTION_LIMIT
                ? `${description.slice(0, DESCRIPTION_LIMIT)}...`
                : description,
        default_branch: item.default_branch ?? null,
        topics: Array.isArray(item.topics) ? item.topics : [],
        stars: typeof item.star_count === "number" ? item.star_count : null,
        url: item.web_url ?? null,
    };
}

export const gitlabTools = [
    [
        "gitlab_project",
        "Search public GitLab projects by keyword (matches name, path and description, not code). Give a project keyword and it returns matching projects with name, namespace, description, default branch, topics, star count and URL. No key needed. GitLab's search answers HTTP 500 for terms with no matching projects, so a no-match term errors instead of returning an empty list.",
        {
            query: z
                .string()
                .min(1)
                .max(200)
                .describe(
                    "Project keyword (searches name, path and description, e.g. 'kubernetes')",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe(
                    "Maximum number of projects to return (1-10, default 5)",
                ),
        },
        async ({ query, limit }, fetchJson) => {
            const term = query.trim();
            if (!term) throw new Error("Query must not be empty.");
            const n =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const url = `${API_ROOT}?search=${encodeURIComponent(term)}&per_page=${n}`;
            let data;
            try {
                data = await fetchJson(url);
            } catch (error) {
                if (/HTTP 500/.test(error.message)) {
                    throw new Error(
                        "GitLab project search failed: gitlab.com returned HTTP 500. " +
                            "GitLab's search answers 500 for terms with no matching projects, so try a broader term.",
                    );
                }
                if (
                    error.name === "AbortError" ||
                    /aborted/i.test(error.message)
                ) {
                    throw new Error(
                        "GitLab project search timed out after 10 s. " +
                            "GitLab's search normally answers in 2–4 s and returns HTTP 500 after ~16 s " +
                            "for terms with no matches, so this may be a no-match term or a slow day — " +
                            "try a broader term or retry.",
                    );
                }
                throw error;
            }
            if (!Array.isArray(data))
                throw new Error("Unexpected response from GitLab.");
            return {
                query: term,
                total: data.length,
                projects: data.slice(0, n).map(formatProject),
            };
        },
    ],
];
