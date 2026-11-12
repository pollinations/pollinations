import { z } from "zod";
import { getJson } from "../fetch.js";

// births, events and the combined feed are larger than the 512 KiB read limit
// in fetch.js on most days, so only the types that fit are offered.
const typeEnum = z.enum(["selected", "deaths", "holidays"]);

export const onThisDayTools = [
    [
        "history_on_this_day",
        "Get historical events, deaths and holidays that happened on a specific month and day from Wikimedia. Returns curated facts with year, description, and related Wikipedia links. Runs with public Wikimedia API; no credentials required.",
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
                    "Type of historical entries: selected events, deaths or holidays (default: selected)",
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
            // 2000 is a leap year, so 29 February is accepted.
            if (new Date(Date.UTC(2000, month - 1, day)).getUTCDate() !== day)
                throw new Error(`Month ${month} has no day ${day}.`);
            const m = String(month).padStart(2, "0");
            const d = String(day).padStart(2, "0");
            const endpoint = `https://en.wikipedia.org/api/rest_v1/feed/onthisday/${type}/${m}/${d}`;
            const data = await getJson(endpoint);
            const list = data[type];
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
