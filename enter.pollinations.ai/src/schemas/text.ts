import { TEXT_SERVICES } from "@shared/registry/text.ts";
import { z } from "zod";


const VALID_TEXT_MODELS = [
    ...Object.keys(TEXT_SERVICES),
    ...Object.values(TEXT_SERVICES).flatMap((service) => service.aliases),
] as const;

export const GenerateTextRequestQueryParamsSchema = z.object({
    model: z
        .enum(VALID_TEXT_MODELS)
        .optional()
        .default("openai")
        .meta({
            description: "Text model to use for generation",
        }),
    seed: z.coerce.number().int().min(-1).optional().default(0).meta({
        description: "Random seed for reproducible results. Use -1 for random.",
    }),
    system: z.string().optional().meta({
        description: "System prompt to set context/behavior for the model",
    }),
    json: z.coerce
        .boolean()
        .optional()
        .default(false)
        .meta({ description: "Return response in JSON format" }),
    temperature: z.coerce.number().optional().meta({
        description: "Controls creativity (0.0=strict, 2.0=creative)",
    }),
    stream: z.coerce
        .boolean()
        .optional()
        .default(false)
        .meta({ description: "Stream response in real-time chunks" }),
});

export type GenerateTextRequestQueryParams = z.infer<
    typeof GenerateTextRequestQueryParamsSchema
>;
