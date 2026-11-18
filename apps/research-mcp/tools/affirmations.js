import { z } from "zod";
import { fetchJson } from "../fetch.js";

const API_URL = "https://www.affirmations.dev/";

export const affirmationTools = [
    [
        "affirmation",
        "Return random positive affirmations, one short sentence each. Novelty — the affirmations are drawn at random from affirmations.dev, not written for a question, and there is no way to ask for one about a topic.",
        {
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(1)
                .describe("Number of affirmations to return, 1 to 10."),
        },
        async ({ limit }) => {
            // Zod only applies via the MCP server; the handler carries its own
            // default and range check (the Terraform lesson).
            const n =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 1;
            // The API returns one affirmation per call and has no batch
            // endpoint, so one fetch per affirmation, in parallel.
            const results = await Promise.all(
                Array.from({ length: n }, () => fetchJson(new URL(API_URL))),
            );
            const affirmations = results.map((data) => {
                if (typeof data?.affirmation !== "string")
                    throw new Error(
                        "Affirmations API returned an unexpected shape.",
                    );
                return data.affirmation;
            });
            return { count: affirmations.length, affirmations };
        },
    ],
];
