// Spaceflight News recent articles.
import { z } from "zod";
import { getJson } from "../fetch.js";

const API_ROOT = "https://api.spaceflightnewsapi.net/v4";
const SUMMARY_LIMIT = 500;

function articleSummary(article) {
    const summary = (article.summary ?? "").replace(/\s+/g, " ").trim();
    if (summary.length <= SUMMARY_LIMIT) return summary;
    return `${summary.slice(0, SUMMARY_LIMIT)}…`;
}

export const spaceflightNewsTools = [
    [
        "spaceflight_news",
        "List recent spaceflight news articles from Spaceflight News: title, short summary, news site, publish date and link. This is news coverage; the launches_upcoming tool covers upcoming launches instead.",
        z.object({
            limit: z
                .number()
                .int()
                .min(1)
                .max(20)
                .default(5)
                .describe("Maximum number of recent articles to return."),
        }),
        async ({ limit = 5 } = {}) => {
            const data = await getJson(`${API_ROOT}/articles/?limit=${limit}`);
            if (!Array.isArray(data?.results))
                throw new Error(
                    "Spaceflight News did not return an article list.",
                );
            return {
                total: data.count ?? data.results.length,
                articles: data.results.map((article) => ({
                    id: article.id ?? null,
                    title: article.title ?? null,
                    summary: articleSummary(article),
                    news_site: article.news_site ?? null,
                    published_at: article.published_at ?? null,
                    url: article.url ?? null,
                })),
            };
        },
    ],
];
