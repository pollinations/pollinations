import { z } from "zod";

const EVILINSULT_URL =
    "https://evilinsult.com/generate_insult.php?lang=en&type=json";

export const evilinsultTools = [
    [
        "evil_insult",
        "Get a random insult from evilinsult.com, with its source. Insults range from Shakespearean-style to modern crude ones and may contain profanity. Random-only — one short insult per call, no search, no topic. One fetch per insult, in parallel.",
        {
            limit: z.number().int().min(1).max(10).default(1),
        },
        async ({ limit }, fetchJson) => {
            const n =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 1;
            const responses = await Promise.all(
                Array.from({ length: n }, () => fetchJson(EVILINSULT_URL)),
            );
            const insults = [];
            for (const response of responses) {
                if (typeof response?.insult !== "string" || !response.insult)
                    throw new Error(
                        "Evil Insult returned an insult without text",
                    );
                insults.push({
                    insult: response.insult,
                    source:
                        typeof response.createdby === "string" &&
                        response.createdby
                            ? response.createdby
                            : null,
                    number:
                        typeof response.number === "string"
                            ? response.number
                            : null,
                    shown:
                        typeof response.shown === "string"
                            ? response.shown
                            : null,
                });
            }
            return { limit: n, insults };
        },
    ],
];
