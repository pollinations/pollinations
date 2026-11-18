import { z } from "zod";

const RONSWANSON_URL = "https://ron-swanson-quotes.herokuapp.com/v2/quotes";

export const ronswansonTools = [
    [
        "ronswanson_quote",
        "Get a random Ron Swanson quote from ron-swanson-quotes.herokuapp.com. Random-only — one short quote per call, no search, no topic. One fetch per quote, in parallel.",
        {
            limit: z.number().int().min(1).max(10).default(1),
        },
        async ({ limit }, fetchJson) => {
            const n =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 1;
            const responses = await Promise.all(
                Array.from({ length: n }, () => fetchJson(RONSWANSON_URL)),
            );
            const quotes = [];
            for (const response of responses) {
                if (
                    !Array.isArray(response) ||
                    typeof response[0] !== "string" ||
                    !response[0]
                )
                    throw new Error(
                        "Ron Swanson Quotes returned a quote without text",
                    );
                quotes.push(response[0]);
            }
            return { limit: n, quotes };
        },
    ],
];
