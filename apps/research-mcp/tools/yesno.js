import { z } from "zod";

const YESNO_URL = "https://yesno.wtf/api";

export const yesnoTools = [
    [
        "yesno_answer",
        "Get a random yes/no/maybe answer from yesno.wtf, with a gif URL. Random-only — one short answer per call, no question, no reasoning. One fetch per answer, in parallel. The image URL is returned as text and never fetched.",
        {
            limit: z.number().int().min(1).max(10).default(1),
        },
        async ({ limit }, fetchJson) => {
            const n =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 1;
            const responses = await Promise.all(
                Array.from({ length: n }, () => fetchJson(YESNO_URL)),
            );
            const answers = [];
            for (const response of responses) {
                if (typeof response?.answer !== "string" || !response.answer)
                    throw new Error("Yes/No returned an answer without text");
                answers.push({
                    answer: response.answer,
                    image:
                        typeof response.image === "string"
                            ? response.image
                            : null,
                });
            }
            return { limit: n, answers };
        },
    ],
];
