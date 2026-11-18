import { z } from "zod";

const RANDOM_URL = "https://uselessfacts.jsph.pl/api/v2/facts/random";

export const uselessFactsTools = [
    [
        "useless_fact",
        "Get random useless facts — short uncited trivia from a humour site, not reference data. One fetch per fact, in parallel.",
        {
            limit: z.number().int().min(1).max(10).default(1),
        },
        async ({ limit }, fetchJson) => {
            const n =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 1;
            const facts = await Promise.all(
                Array.from({ length: n }, () => fetchJson(RANDOM_URL)),
            );
            const seen = new Set();
            const projected = [];
            for (const fact of facts) {
                if (typeof fact?.text !== "string" || !fact.text)
                    throw new Error(
                        "Useless Facts returned a fact without text",
                    );
                if (seen.has(fact.id)) continue;
                seen.add(fact.id);
                projected.push({
                    text: fact.text,
                    source: fact.source ?? null,
                    permalink: fact.permalink ?? null,
                });
            }
            return { limit: n, facts: projected };
        },
    ],
];
