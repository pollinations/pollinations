import { DEFAULT_TEXT_MODEL } from "@shared/registry/text.ts";
import { SafeSchema } from "@shared/schemas/safety.ts";
import { z } from "zod";
import { parseBooleanLike } from "@/util.ts";

// z.coerce.boolean() coerces the string "false" to true; parse boolean-ish
// tokens instead and let unrecognized values fail validation.
const BooleanQueryParamSchema = z.preprocess(
    (value) => parseBooleanLike(value) ?? value,
    z.boolean(),
);

const FloatQueryParamSchema = z.preprocess((value) => {
    if (value == null) return undefined;
    const parsed = Number.parseFloat(String(value));
    return Number.isNaN(parsed) ? undefined : parsed;
}, z.number().optional());

const IntQueryParamSchema = z.preprocess((value) => {
    if (value == null) return undefined;
    const parsed = Number.parseInt(String(value), 10);
    return Number.isNaN(parsed) ? undefined : parsed;
}, z.number().int().optional());

export const GenerateTextRequestQueryParamsSchema = z.object({
    model: z.string().optional().default(DEFAULT_TEXT_MODEL).meta({
        description:
            "Text model to use. See /v1/models or /text/models for the full list of available models.",
    }),
    seed: z.coerce.number().int().min(-1).optional().meta({
        description: "Seed for reproducible results. Use -1 for random.",
    }),
    system: z.string().optional().meta({
        description:
            "System prompt to set the model's behavior and context. Acts as initial instructions before the user prompt.",
    }),
    json: BooleanQueryParamSchema.optional().meta({
        description:
            "When true, the model returns valid JSON. Useful for structured data extraction.",
    }),
    temperature: z.coerce.number().optional().meta({
        description:
            "Controls randomness. Lower values (e.g. 0.2) produce more focused output, higher values (e.g. 1.5) produce more creative output. Range: 0.0 to 2.0.",
    }),
    top_p: FloatQueryParamSchema,
    presence_penalty: FloatQueryParamSchema,
    frequency_penalty: FloatQueryParamSchema,
    repetition_penalty: FloatQueryParamSchema,
    max_tokens: IntQueryParamSchema,
    max_completion_tokens: IntQueryParamSchema,
    reasoning_effort: z.string().optional(),
    voice: z.string().optional(),
    stream: BooleanQueryParamSchema.optional().meta({
        description:
            "Stream the response as it's generated, using Server-Sent Events (SSE). Each chunk contains partial text.",
    }),
    safe: SafeSchema,
});

export type GenerateTextRequestQueryParams = z.infer<
    typeof GenerateTextRequestQueryParamsSchema
>;
