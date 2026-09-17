import { z } from "zod";

const jevQuestionSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("choice"),
        instructions: z.string(),
        criteria: z.record(z.string(), z.string()),
    }),
    z.object({
        type: z.literal("score"),
        instructions: z.string(),
        criteria: z.array(z.string()).min(2),
    }),
    z.object({
        type: z.literal("noul"),
        instructions: z.string(),
        criteria: z
            .object({
                true: z.string().optional(),
                false: z.string().optional(),
            })
            .optional(),
    }),
]);

export const jevInputSchema = {
    state: z.string(),
    questions: z.record(z.string(), jevQuestionSchema),
};

export function questionsToProperties(questions) {
    return Object.fromEntries(
        Object.entries(questions).map(([name, question]) => {
            // Gen forwards descriptions as instructions; preserve option guidance
            // there without adding provider-specific JSON Schema keywords.
            const description =
                question.type !== "score" && question.criteria
                    ? `${question.instructions}\n\nCriteria: ${JSON.stringify(question.criteria)}`
                    : question.instructions;
            switch (question.type) {
                case "choice":
                    return [
                        name,
                        {
                            type: "string",
                            enum: Object.keys(question.criteria),
                            description,
                        },
                    ];
                case "score":
                    return [
                        name,
                        {
                            type: "integer",
                            enum: question.criteria,
                            description,
                        },
                    ];
                case "noul":
                    return [
                        name,
                        {
                            type: "number",
                            minimum: 0,
                            maximum: 1,
                            description,
                        },
                    ];
                default:
                    throw new Error(
                        `Unsupported question type: ${question.type}`,
                    );
            }
        }),
    );
}

export function answersFromContent(content, questions) {
    return Object.fromEntries(
        Object.entries(questions).map(([name, question]) => [
            name,
            { type: question.type, ...content[name] },
        ]),
    );
}
