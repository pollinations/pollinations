import { TEXT_SERVICES } from "@shared/registry/text.ts";
import { z } from "zod";

export const GenerateTextRequestQueryParamsSchema = z.object({
    model: z
        .enum(Object.keys(TEXT_SERVICES) as [string, ...string[]])
        .optional()
        .default("openai")
        .meta({
            description: "Text model to use for generation",
        }),
    seed: z.coerce
        .number()
        .int()
        .optional()
        .meta({ description: "Random seed for reproducible results" }),
    system: z
        .string()
        .optional()
        .meta({ description: "System prompt to set context for the model" }),
    json: z.coerce
        .boolean()
        .optional()
        .default(false)
        .meta({ description: "Return response in JSON format" }),
});

export type GenerateTextRequestQueryParams = z.infer<
    typeof GenerateTextRequestQueryParamsSchema
>;
