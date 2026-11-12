import { z } from "zod";
import { getText } from "../fetch.js";

const GITHUB_SEARCH_URL = "https://api.github.com/search/repositories";

export async function getTrendingRepos({
    language,
    days = 7,
    limit = 10,
    sort = "stars",
}) {
    const targetDays = Math.max(1, Math.min(days, 30));
    const targetLimit = Math.max(1, Math.min(limit, 30));

    const sinceDate = new Date(Date.now() - targetDays * 86400 * 1000);
    const dateStr = sinceDate.toISOString().split("T")[0];

    let q = `created:>${dateStr}`;
    if (language?.trim()) {
        q += ` language:${language.trim()}`;
    }

    const params = new URLSearchParams({
        q,
        sort: sort === "forks" ? "forks" : "stars",
        order: "desc",
        per_page: String(targetLimit),
    });

    const url = `${GITHUB_SEARCH_URL}?${params.toString()}`;
    const { text } = await getText(url);
    const data = JSON.parse(text);

    const items = (data.items || []).map((repo) => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        description: repo.description,
        url: repo.html_url,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        language: repo.language,
        created_at: repo.created_at,
        updated_at: repo.updated_at,
        owner: repo.owner ? repo.owner.login : null,
    }));

    return {
        query: q,
        since_date: dateStr,
        count: items.length,
        repositories: items,
    };
}

export const githubTools = [
    [
        "github_trending",
        "Discover trending or newly active open-source repositories on GitHub filtered by language, recency, and stars/forks.",
        {
            language: z
                .string()
                .optional()
                .describe(
                    "Programming language filter (e.g. 'typescript', 'python', 'rust')",
                ),
            days: z
                .number()
                .int()
                .min(1)
                .max(30)
                .default(7)
                .optional()
                .describe(
                    "Time window in days to consider for repository creation (1-30 days, default 7)",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(30)
                .default(10)
                .optional()
                .describe(
                    "Maximum number of repositories to return (1-30, default 10)",
                ),
            sort: z
                .enum(["stars", "forks"])
                .default("stars")
                .optional()
                .describe(
                    "Metric to sort repositories by ('stars' or 'forks', default 'stars')",
                ),
        },
        (args) => getTrendingRepos(args),
    ],
];
