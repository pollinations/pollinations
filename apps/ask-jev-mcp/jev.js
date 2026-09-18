import { z } from "zod";

// Native TypeSafe instructions and criteria entries may be a string, object, or
// array; keep the schema aligned without reimplementing upstream validation.
const jevText = z.union([
    z.string(),
    z.record(z.string(), z.unknown()),
    z.array(z.unknown()),
]);

const jevQuestionSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("choice"),
        instructions: jevText,
        criteria: z.record(z.string(), jevText.nullable()),
    }),
    z.object({
        type: z.literal("score"),
        instructions: jevText,
        criteria: z.array(jevText).min(2),
    }),
    z.object({
        type: z.literal("noul"),
        instructions: jevText,
        criteria: z
            .object({
                true: jevText.optional(),
                false: jevText.optional(),
            })
            .optional(),
    }),
]);

export const jevInputSchema = {
    state: jevText,
    questions: z.record(z.string(), jevQuestionSchema),
};
