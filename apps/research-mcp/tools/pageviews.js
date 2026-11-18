import { z } from "zod";

const article = z.string().trim().min(1).max(200);
const days = z.number().int().min(1).max(30).default(7);

const yyyymmdd = (date) => date.toISOString().slice(0, 10).replaceAll("-", "");

export const pageviewsTools = [
    [
        "pageviews",
        "Daily pageviews for one English Wikipedia article over the last N days. Returns the article, the date range and views per day plus a total. Article titles use underscores for spaces upstream. This is traffic data, not article content — wikipedia_search and wikipedia_page cover the text.",
        {
            article,
            days,
        },
        async ({ article, days }, fetchJson) => {
            const name = article?.trim();
            if (!name) throw new Error("An article title is required.");
            const n =
                Number.isInteger(days) && days >= 1 && days <= 30 ? days : 7;
            const end = new Date();
            const start = new Date(end.getTime() - n * 86400000);
            const title = name.replaceAll(" ", "_");
            let data;
            try {
                data = await fetchJson(
                    `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(title)}/daily/${yyyymmdd(start)}/${yyyymmdd(end)}`,
                );
            } catch (error) {
                if (/HTTP 404/.test(error.message))
                    throw new Error(`Article not found: ${name}`);
                throw error;
            }
            if (!Array.isArray(data?.items))
                throw new Error("Unexpected Wikimedia response.");
            const perDay = data.items.map((item) => ({
                date: `${item.timestamp.slice(0, 4)}-${item.timestamp.slice(4, 6)}-${item.timestamp.slice(6, 8)}`,
                views: item.views,
            }));
            return {
                article: data.items[0]?.article ?? title,
                start: perDay[0]?.date ?? null,
                end: perDay.at(-1)?.date ?? null,
                total: perDay.reduce((sum, day) => sum + day.views, 0),
                days: perDay,
            };
        },
    ],
];
