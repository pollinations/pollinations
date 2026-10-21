import { z } from "zod";
import { SAFETY_FEATURES } from "../schemas/safety";
import {
    MODEL_CATEGORIES,
    MODEL_INPUT_MODALITIES,
    MODEL_OUTPUT_MODALITIES,
    PRICE_UNITS,
    VIDEO_CAPABILITIES,
} from "./model-constants";
import type { ModelDefinition } from "./registry";

// Runtime contract for one-model-per-file registry entries. The per-file
// `satisfies ModelDefinition` checks authoring against the static type; this
// schema checks the loaded object at build/startup (typos fail the loader,
// not production traffic).
// A cost record may price from getters (FLUX.3 quotes a dated launch
// discount), so validate without copying: `z.record` would read each getter
// once at module load and freeze that rate for the life of the isolate.
const costSchema = z.custom<Record<string, number>>(
    (value) =>
        Object.prototype.toString.call(value) === "[object Object]" &&
        Object.values(value as object).every(
            (entry) => typeof entry === "number" && Number.isFinite(entry),
        ),
    { message: "expected a record of finite numbers" },
);

export const ModelFileSchema = z.strictObject({
    aliases: z.array(z.string()),
    provider: z.string(),
    publisher: z.string(),
    category: z.enum(MODEL_CATEGORIES),
    cost: costSchema,
    priceMultiplier: z.number(),
    addedDate: z.number(),
    title: z.string(),
    paidOnly: z.boolean(),

    perUserRpm: z.number().nullish(),
    fallbacks: z.array(z.string()).optional(),
    requiredSafetyFeatures: z.array(z.enum(SAFETY_FEATURES)).optional(),
    costVariants: z.record(z.string(), costSchema).optional(),
    costVariantMetadata: z.record(z.string(), z.any()).optional(),
    defaultCostVariantLabel: z.string().optional(),
    pricingDimensions: z.array(z.any()).optional(),
    selectCostVariant: z
        .custom<() => string | undefined>((v) => typeof v === "function", {
            message: "selectCostVariant must be a function",
        })
        .optional(),
    billing: z.any().optional(),
    description: z.string().optional(),
    inputModalities: z.array(z.enum(MODEL_INPUT_MODALITIES)).optional(),
    outputModalities: z.array(z.enum(MODEL_OUTPUT_MODALITIES)).optional(),
    tools: z.boolean().optional(),
    supportedParameters: z.array(z.string()).optional(),
    reasoning: z.boolean().optional(),
    search: z.boolean().optional(),
    codeExecution: z.boolean().optional(),
    contextLength: z.number().optional(),
    voices: z.array(z.string()).optional(),
    isSpecialized: z.boolean().optional(),
    alpha: z.boolean().optional(),
    flatRate: z.boolean().optional(),
    priceUnits: z
        .record(
            z.string(),
            z.object({
                unit: z.enum(PRICE_UNITS),
                quantity: z.number().optional(),
            }),
        )
        .optional(),
    hidden: z.boolean().optional(),
    fallbackOnly: z.boolean().optional(),
    cacheVersion: z.string().optional(),
    supportedEndpoints: z.array(z.string()).optional(),
    resolutions: z.array(z.string()).optional(),
    videoCapabilities: z.array(z.enum(VIDEO_CAPABILITIES)).optional(),
    minDuration: z.number().optional(),
    maxDuration: z.number().optional(),
    defaultDuration: z.number().optional(),
    allowedDurations: z.array(z.number()).optional(),
    durationStep: z.number().optional(),
    maxReferenceImages: z.number().optional(),
    maxReferenceVideos: z.number().optional(),
    supportsTransparency: z.boolean().optional(),
    maxCompletionTokens: z.number().optional(),
    supportsStructuredOutput: z.boolean().optional(),
    supportsJsonMode: z.boolean().optional(),
    supportsStreaming: z.boolean().optional(),
    brandUrl: z.string().optional(),
    brandIconUrl: z.string().optional(),
});

// Compile-time drift guard: everything the schema accepts must be a valid
// ModelDefinition. The reverse (schema not rejecting a valid definition) is
// enforced at runtime: the loaders parse every model file at startup, so a
// schema that is too strict fails the catalog, not production traffic.
type SchemaMatchesDefinition<
    TSchema = z.output<typeof ModelFileSchema>,
    TDef = ModelDefinition,
> = [TSchema] extends [TDef] ? true : never;
// biome-ignore lint/correctness/noUnusedVariables: compile-time assertion
const schemaMatchesDefinition: SchemaMatchesDefinition = true;

// A fallback route is the difference from the model it serves: provider
// required (never inherited), every other field an optional override, and the
// four merge-owned fields (aliases/fallbacks/fallbackOnly/hidden) forbidden.
const MERGE_OWNED = new Set([
    "aliases",
    "fallbacks",
    "fallbackOnly",
    "hidden",
    "provider",
]);
const overrideable = Object.fromEntries(
    Object.entries(ModelFileSchema.shape)
        .filter(([key]) => !MERGE_OWNED.has(key))
        .map(([key, field]) => [key, field.optional()]),
);

export const FallbackFileSchema = z.strictObject({
    provider: z.string(),
    ...overrideable,
});
