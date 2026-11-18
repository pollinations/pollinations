import { z } from "zod";

const STOIC_URL = "https://stoic.tekloon.net/stoic-quote";

export const stoicTools = [
    [
        "stoic_quote",
        "Get a random Stoic quote from stoic.tekloon.net, with its author. Random-only — one short quote per call, no search, no topic. One fetch per quote, in parallel.",
        {
            limit: z.number().int().min(1).max(10).default(1),
        },
        async ({ limit }, fetchJson) => {
            const n =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 1;
            const responses = await Promise.all(
                Array.from({ length: n }, () => fetchJson(STOIC_URL)),
            );
            const quotes = [];
            for (const response of responses) {
                if (
                    typeof response?.data?.quote !== "string" ||
                    !response.data.quote
                )
                    throw new Error(
                        "Stoic Quotes returned a quote without text",
                    );
                quotes.push({
                    quote: response.data.quote,
                    author:
                        typeof response.data.author === "string"
                            ? response.data.author
                            : null,
                });
            }
            return { limit: n, quotes };
        },
    ],
];
