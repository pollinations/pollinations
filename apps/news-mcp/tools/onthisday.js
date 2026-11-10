import { z } from "zod";
import { getJson } from "../fetch.js";

const typeEnum = z.enum([
    "all",
    "selected",
    "births",
    "deaths",
    "events",
    "holidays",
]);

export const onThisDayTools = [
    [
        "history_on_this_day",
        "Get historical events, births, deaths, and holidays that happened on a specific month and day from Wikimedia. Returns curated facts with year, description, and related Wikipedia links. Runs with public Wikimedia API; no credentials required.",
        z.object({
            month: z.number().int().min(1).max(12).describe("Month (1 to 12)"),
            day: z
                .number()
                .int()
                .min(1)
                .max(31)
                .describe("Day of month (1 to 31)"),
            type: typeEnum
                .default("selected")
                .describe(
                    "Type of historical entries: all, selected, births, deaths, events, or holidays (default: selected)",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(20)
                .default(10)
                .describe(
                    "Maximum number of entries to return (default: 10, max: 20)",
                ),
        }),
        async ({ month, day, type, limit }) => {
            const m = String(month).padStart(2, "0");
            const d = String(day).padStart(2, "0");
            const endpoint = `https://en.wikipedia.org/api/rest_v1/feed/onthisday/${type}/${m}/${d}`;

            const signal = AbortSignal.timeout(10_000);
            const data = await getJson(endpoint, signal);

            const list = data[type] || data.selected || data.events || [];
            const sliced = Array.isArray(list) ? list.slice(0, limit) : [];

            return {
                month,
                day,
                type,
                total: sliced.length,
                items: sliced.map((item) => ({
                    text: item.text,
                    year: item.year ?? null,
                    pages: Array.isArray(item.pages)
                        ? item.pages.slice(0, 3).map((p) => ({
                              title: p.title,
                              description: p.description,
                              url: p.content_urls?.desktop?.page,
                          }))
                        : [],
                })),
            };
        },
    ],
];
