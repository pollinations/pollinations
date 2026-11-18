import { z } from "zod";

const query = z.string().trim().min(1).max(200);

export const mdnTools = [
    [
        "mdn_search",
        "Search MDN Web Docs for web-platform documentation. Returns matching docs with title, plain-text summary, relevance score and URL. Web-platform docs, not encyclopedia facts — Wikipedia answers those.",
        {
            query,
            limit: z.number().int().min(1).max(10).default(5),
        },
        async ({ query, limit = 5 }, fetchJson) => {
            if (!query?.trim()) throw new Error("query must not be blank");
            const n =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const data = await fetchJson(
                `https://developer.mozilla.org/api/v1/search?${new URLSearchParams({ q: query.trim(), locale: "en-US" })}`,
            );
            if (!Array.isArray(data.documents))
                throw new Error("MDN search returned an unexpected response");
            return {
                query: query.trim(),
                total: data.metadata?.total?.value ?? data.documents.length,
                results: data.documents.slice(0, n).map((doc) => ({
                    title: doc.title,
                    summary: doc.summary,
                    score: doc.score,
                    url: `https://developer.mozilla.org${doc.mdn_url}`,
                })),
            };
        },
    ],
];
