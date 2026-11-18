import { z } from "zod";

const TYPEFIT_URL = "https://type.fit/api/quotes";

export const typefitTools = [
    [
        "inspirational_quote",
        "Get inspirational quotes from type.fit. The endpoint returns a fixed set of 5 quotes per call (text + author) — no search, no topic, and the same 5 may repeat across calls. One fetch per call, sliced client-side.",
        {
            limit: z.number().int().min(1).max(5).default(5),
        },
        async ({ limit }, fetchJson) => {
            const n =
                Number.isInteger(limit) && limit >= 1 && limit <= 5 ? limit : 5;
            const response = await fetchJson(TYPEFIT_URL);
            if (!Array.isArray(response) || response.length === 0)
                throw new Error("Type.fit returned no quotes");
            const quotes = [];
            for (const item of response) {
                if (typeof item?.text !== "string" || !item.text)
                    throw new Error("Type.fit returned a quote without text");
                quotes.push({
                    text: item.text,
                    author:
                        typeof item.author === "string" ? item.author : null,
                });
            }
            return {
                limit: n,
                total: quotes.length,
                quotes: quotes.slice(0, n),
            };
        },
    ],
];
