import { DEFAULT_TEXT_MODEL, TEXT_SERVICES } from "@shared/registry/text.ts";
import { z } from "zod";

const VALID_TEXT_MODELS = [
    ...Object.keys(TEXT_SERVICES),
    ...Object.values(TEXT_SERVICES).flatMap((service) => service.aliases),
] as const;

export const GenerateTextRequestQueryParamsSchema = z.object({
    model: z
        .enum(VALID_TEXT_MODELS as unknown as [string, ...string[]])
        .optional()
        .default(DEFAULT_TEXT_MODEL)
        .meta({
            description:
                "Text model to use. See /v1/models or /text/models for the full list of available models.",
        }),
    seed: z.coerce.number().int().min(-1).optional().default(0).meta({
        description: "Seed for reproducible results. Use -1 for random.",
    }),
    system: z.string().optional().meta({
        description:
            "System prompt to set the model's behavior and context. Acts as initial instructions before the user prompt.",
    }),
    json: z.coerce
        .boolean()
        .optional()
        .default(false)
        .meta({
            description:
                "When true, the model returns valid JSON. Useful for structured data extraction.",
        }),
    temperature: z.coerce.number().optional().meta({
        description:
            "Controls randomness. Lower values (e.g. 0.2) produce more focused output, higher values (e.g. 1.5) produce more creative output. Range: 0.0 to 2.0.",
    }),
    stream: z.coerce
        .boolean()
        .optional()
        .default(false)
        .meta({
            description:
                "Stream the response as it's generated, using Server-Sent Events (SSE). Each chunk contains partial text.",
        }),
});

export type GenerateTextRequestQueryParams = z.infer<
    typeof GenerateTextRequestQueryParamsSchema
>;
