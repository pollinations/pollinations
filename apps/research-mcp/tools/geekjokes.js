import { z } from "zod";

const GEEKJOKES_URL = "https://geek-jokes.sameerkumar.website/api?format=json";

export const geekjokesTools = [
    [
        "geek_joke",
        "Get a random programming/geek joke from geek-jokes.sameerkumar.website. Random-only — one short joke per call, no search, no topic. One fetch per joke, in parallel.",
        {
            limit: z.number().int().min(1).max(10).default(1),
        },
        async ({ limit }, fetchJson) => {
            const n =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 1;
            const responses = await Promise.all(
                Array.from({ length: n }, () => fetchJson(GEEKJOKES_URL)),
            );
            const jokes = [];
            for (const response of responses) {
                if (typeof response?.joke !== "string" || !response.joke)
                    throw new Error("Geek Jokes returned a joke without text");
                jokes.push(response.joke);
            }
            return { limit: n, jokes };
        },
    ],
];
