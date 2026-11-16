import { z } from "zod";

// Based on tomdacatto's Wikipedia tools: pollinations/pollinations#17745.
const language = z
    .string()
    .regex(/^[a-z]{2,12}(?:-[a-z]{2,12})?$/)
    .default("en")
    .describe("Wikipedia edition, e.g. en, de, simple.");
const title = z.string().trim().min(1).max(300);

export const wikipediaTools = [
    [
        "wikipedia_search",
        "Search Wikipedia. Returns source titles, URLs and excerpts (HTML markup).",
        {
            query: title,
            language,
            limit: z.number().int().min(1).max(10).default(5),
        },
        async ({ query, language, limit }, fetchJson) => {
            const data = await fetchJson(
                `https://${language}.wikipedia.org/w/rest.php/v1/search/page?${new URLSearchParams({ q: query, limit })}`,
            );
            return data.pages.map((page) => ({
                title: page.title,
                description: page.description,
                excerpt: page.excerpt,
                url: `https://${language}.wikipedia.org/wiki/${encodeURIComponent(page.key)}`,
            }));
        },
    ],
    [
        "wikipedia_page",
        "Read a Wikipedia summary, or full=true for plain article text (at most 20000 characters). Cite the source URL; text is CC BY-SA.",
        {
            title: title.regex(/^[^|]+$/),
            language,
            full: z.boolean().default(false),
        },
        async ({ title, language, full }, fetchJson) => {
            const source = `https://${language}.wikipedia.org/wiki/${encodeURIComponent(title)}`;
            if (!full) {
                const page = await fetchJson(
                    `https://${language}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
                );
                return {
                    title: page.title,
                    description: page.description,
                    text: page.extract,
                    url: page.content_urls?.desktop?.page ?? source,
                };
            }
            const data = await fetchJson(
                `https://${language}.wikipedia.org/w/api.php?${new URLSearchParams(
                    {
                        action: "query",
                        prop: "extracts",
                        explaintext: "1",
                        redirects: "1",
                        format: "json",
                        formatversion: "2",
                        titles: title,
                    },
                )}`,
            );
            if (data.error) throw new Error(data.error.info);
            const page = data.query.pages[0];
            if (page.missing)
                throw new Error(`Wikipedia page not found: ${title}`);
            return {
                title: page.title,
                text: page.extract.slice(0, 20_000),
                truncated: page.extract.length > 20_000,
                url: `https://${language}.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
            };
        },
    ],
];
