import { z } from "zod";

const FACTS_URL = "https://dogapi.dog/api/v2/facts";

export const dogFactsTools = [
    [
        "dog_fact",
        "Get random dog facts — short trivia about dogs from dogapi.dog, not reference data. One fetch per call; the server-side limit returns that many facts.",
        {
            limit: z.number().int().min(1).max(10).default(1),
        },
        async ({ limit }, fetchJson) => {
            const n =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 1;
            const url = new URL(FACTS_URL);
            url.search = new URLSearchParams({ limit: String(n) }).toString();
            const data = await fetchJson(url, "Dog Facts");
            if (!Array.isArray(data?.data))
                throw new Error("Dog Facts returned an unexpected response");
            const facts = [];
            for (const record of data.data) {
                const body = record?.attributes?.body;
                if (typeof body !== "string" || !body)
                    throw new Error("Dog Facts returned a fact without text");
                facts.push(body);
            }
            return { limit: n, facts };
        },
    ],
];
