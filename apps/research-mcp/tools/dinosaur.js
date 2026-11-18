import { z } from "zod";

const DINOSAUR_URL =
    "https://dinosaur-facts-api.shultzlab.com/dinosaurs/random";

export const dinosaurTools = [
    [
        "dinosaur_fact",
        "Get a random dinosaur fact from dinosaur-facts-api.shultzlab.com — a dinosaur name plus a one-line description. Random-only — one short fact per call, no search, no topic. One fetch per fact, in parallel.",
        {
            limit: z.number().int().min(1).max(10).default(1),
        },
        async ({ limit }, fetchJson) => {
            const n =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 1;
            const responses = await Promise.all(
                Array.from({ length: n }, () => fetchJson(DINOSAUR_URL)),
            );
            const facts = [];
            for (const response of responses) {
                if (
                    typeof response !== "object" ||
                    response === null ||
                    typeof response.Name !== "string" ||
                    !response.Name ||
                    typeof response.Description !== "string" ||
                    !response.Description
                )
                    throw new Error(
                        "Dinosaur Facts returned a fact without text",
                    );
                facts.push({
                    name: response.Name,
                    description: response.Description,
                });
            }
            return { limit: n, facts };
        },
    ],
];
