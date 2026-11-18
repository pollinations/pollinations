import { z } from "zod";
import { getJson } from "../fetch.js";

export const dailymotionTools = [
    [
        "dailymotion_search",
        "Search Dailymotion videos by keyword. Returns matching videos with id, title, duration in seconds and watch URL. Runs with the public Dailymotion API; no credentials required. The upstream total is capped at 1,000 matches.",
        z.object({
            query: z
                .string()
                .min(1)
                .max(500)
                .describe("Search keywords, e.g. 'python tutorial'"),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe(
                    "Maximum number of videos to return (default: 5, max: 10)",
                ),
        }),
        async ({ query, limit }) => {
            const q = query.trim();
            if (!q) throw new Error("Query must not be empty.");
            // zod only applies via the MCP server, so the handler carries its
            // own default and range check.
            const n =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const endpoint = `https://api.dailymotion.com/videos?search=${encodeURIComponent(q)}&limit=${n}&fields=id,title,duration,url`;
            const data = await getJson(endpoint);
            if (!Array.isArray(data.list))
                throw new Error("Dailymotion returned no video list.");
            return {
                query: q,
                total: data.total ?? data.list.length,
                videos: data.list.slice(0, n).map((video) => ({
                    id: video.id,
                    title: video.title,
                    duration: video.duration ?? null,
                    url:
                        video.url ??
                        `https://www.dailymotion.com/video/${video.id}`,
                })),
            };
        },
    ],
];
