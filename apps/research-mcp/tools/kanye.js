import { z } from "zod";

const KANYE_URL = "https://api.kanye.rest/";

export const kanyeTools = [
    [
        "kanye_quote",
        "Get random Kanye West quotes from api.kanye.rest. Random-only — one short unattributed quote per call, no search, no topic. One fetch per quote, in parallel.",
        {
            limit: z.number().int().min(1).max(10).default(1),
        },
        async ({ limit }, fetchJson) => {
            const n =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 1;
            const responses = await Promise.all(
                Array.from({ length: n }, () => fetchJson(KANYE_URL)),
            );
            const seen = new Set();
            const quotes = [];
            for (const response of responses) {
                if (typeof response?.quote !== "string" || !response.quote)
                    throw new Error("Kanye Rest returned a quote without text");
                if (seen.has(response.quote)) continue;
                seen.add(response.quote);
                quotes.push(response.quote);
            }
            return { limit: n, quotes };
        },
    ],
];
