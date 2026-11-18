import { z } from "zod";
import { getJson } from "../fetch.js";

const SEPIASEARCH = "https://sepiasearch.org/api/v1/search/videos";

export const peertubeTools = [
    [
        "peertube_search",
        "Search PeerTube videos across federated instances through SepiaSearch. Returns matching videos with title, channel, instance, duration in seconds, views, published date and watch URL. Runs with the public SepiaSearch API; no credentials required.",
        z.object({
            query: z
                .string()
                .trim()
                .min(1)
                .max(300)
                .describe("Search terms for PeerTube videos"),
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
            const q = typeof query === "string" ? query.trim() : "";
            if (!q) throw new Error("A search query is required.");
            const n =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const params = new URLSearchParams({
                search: q,
                count: String(n),
            });
            const data = await getJson(`${SEPIASEARCH}?${params}`);
            if (!Array.isArray(data?.data))
                throw new Error("SepiaSearch did not return a video list.");
            return {
                query: q,
                total: data.total ?? data.data.length,
                videos: data.data.slice(0, n).map((video) => ({
                    title: video.name ?? null,
                    channel:
                        video.channel?.displayName ??
                        video.channel?.name ??
                        null,
                    instance: video.channel?.host ?? null,
                    duration: video.duration ?? null,
                    views: video.views ?? null,
                    published: video.publishedAt ?? null,
                    url: video.url ?? null,
                })),
            };
        },
    ],
];
