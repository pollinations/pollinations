import { z } from "zod";
import { SAFETY_FEATURES } from "../schemas/safety.ts";
import { publicPriceInfo, toFixedPoint } from "./public-pricing";
import {
    type BillingAdjustmentRule,
    getPriceDefinitionForModel,
    getRegistryModelDefinition,
    getVisibleAudioModels,
    getVisibleEmbeddingModels,
    getVisibleImageModels,
    getVisibleModel3dModels,
    getVisibleRealtimeModels,
    getVisibleTextModels,
    MODEL_CATEGORIES,
    MODEL_INPUT_MODALITIES,
    MODEL_OUTPUT_MODALITIES,
    type ModelDefinition,
    type ModelName,
    type PriceDefinition,
    VIDEO_CAPABILITIES,
} from "./registry";

export const ModelCapabilitySchema = z.enum([
    "tool_calling",
    "reasoning",
    "web_search",
    "code_execution",
    "pollinations_models",
]);

export type ModelCapability = z.infer<typeof ModelCapabilitySchema>;

// Pricing uses registry field names directly, filtering out zero/undefined values
// Fields: promptTextTokens, promptCachedTokens, promptCacheWriteTokens,
//         promptAudioTokens, promptAudioSeconds, promptImageTokens,
//         completionTextTokens, completionReasoningTokens, completionAudioTokens,
//         completionImageTokens, completionVideoSeconds, completionVideoTokens
export const ModelInfoSchema = z.object({
    name: z.string(),
    aliases: z.array(z.string()),
    category: z.enum(MODEL_CATEGORIES),
    brand: z.string(),
    brand_url: z.string().url().optional(),
    community: z.boolean().optional(),
    agent: z.boolean().optional(),
    base_model: z.string().optional(),
    per_user_rpm: z.number().positive().nullable().optional(),
    pricing: z
        .record(z.string(), z.string())
        .and(z.object({ currency: z.literal("pollen") })),
    pricing_variants: z
        .array(
            z.object({
                name: z.string(),
                label: z.string(),
                description: z.string(),
                pricing: z
                    .record(z.string(), z.string())
                    .and(z.object({ currency: z.literal("pollen") })),
            }),
        )
        .optional(),
    pricing_default_label: z.string().optional(),
    pricing_adjustments: z
        .array(
            z.object({
                name: z.string(),
                label: z.string(),
                kind: z.string(),
                price: z.string(),
                currency: z.literal("pollen"),
                quantity: z.number().positive(),
                unit: z.string(),
                suffix: z.string().optional(),
                option: z
                    .object({
                        group: z.string(),
                        value: z.string(),
                        label: z.string(),
                        default: z.boolean().optional(),
                    })
                    .optional(),
            }),
        )
        .optional(),
    resolutions: z.array(z.string()).optional(),
    title: z.string(),
    description: z.string().optional(),
    input_modalities: z.array(z.enum(MODEL_INPUT_MODALITIES)).optional(),
    output_modalities: z.array(z.enum(MODEL_OUTPUT_MODALITIES)).optional(),
    required_safety: z.array(z.enum(SAFETY_FEATURES)).optional(),
    supported_endpoints: z.array(z.string()).optional(),
    video_capabilities: z.array(z.enum(VIDEO_CAPABILITIES)).optional(),
    min_duration: z.number().positive().optional(),
    max_duration: z.number().positive().optional(),
    default_duration: z.number().positive().optional(),
    allowed_durations: z.array(z.number().positive()).optional(),
    duration_step: z.number().positive().optional(),
    max_reference_images: z.number().int().positive().optional(),
    max_reference_videos: z.number().int().positive().optional(),
    capabilities: z.array(ModelCapabilitySchema),
    tools: z.boolean().optional(),
    reasoning: z.boolean().optional(),
    context_length: z.number().optional(),
    voices: z.array(z.string()).optional(),
    is_specialized: z.boolean().optional(),
    paid_only: z.boolean().optional(),
    pending_change: z
        .object({
            effective_at: z.string().datetime(),
            paid_only: z.boolean(),
            pricing: z
                .record(z.string(), z.string())
                .and(z.object({ currency: z.literal("pollen") })),
        })
        .optional(),
    alpha: z.boolean().optional(),
    flat_rate: z.boolean().optional(),
    added_date: z.number().optional(),
});

export type ModelInfo = z.infer<typeof ModelInfoSchema>;

function getCapabilities(service: ModelDefinition): ModelCapability[] {
    const capabilities: ModelCapability[] = [];
    if (service.tools) capabilities.push("tool_calling");
    if (service.reasoning) capabilities.push("reasoning");
    if (service.search) capabilities.push("web_search");
    if (service.codeExecution) capabilities.push("code_execution");
    return capabilities;
}

type ModelInfoOptions = {
    community?: boolean;
    agent?: boolean;
};

function pricingInfoFromDefinition(
    priceDefinition: PriceDefinition,
): Record<string, string> & { currency: "pollen" } {
    const pricing: Record<string, string> & { currency: "pollen" } = {
        currency: "pollen",
    };
    for (const [key, value] of Object.entries(priceDefinition)) {
        if (typeof value === "number" && value > 0) {
            pricing[key] = toFixedPoint(value);
        }
    }
    return pricing;
}

function pricingAdjustmentInfoFromRule(
    rule: BillingAdjustmentRule,
    service: ModelDefinition,
) {
    return publicPriceInfo(rule, service.priceMultiplier);
}

export function modelInfoFromDefinition(
    name: string,
    service: ModelDefinition,
    options: ModelInfoOptions = {},
): ModelInfo {
    return {
        name,
        aliases: service.aliases,
        category: service.category,
        brand: service.brand,
        brand_url: service.brandUrl,
        community: options.community || undefined,
        agent: options.agent || undefined,
        per_user_rpm: service.perUserRpm,
        pricing: pricingInfoFromDefinition(getPriceDefinitionForModel(service)),
        pricing_variants:
            service.costVariants && service.costVariantMetadata
                ? Object.entries(service.costVariants).map(
                      ([name, variantCost]) => {
                          const metadata = service.costVariantMetadata?.[name];
                          return {
                              name,
                              label: metadata?.label ?? name,
                              description: metadata?.description ?? name,
                              pricing: pricingInfoFromDefinition(
                                  getPriceDefinitionForModel({
                                      ...service,
                                      cost: {
                                          ...service.cost,
                                          ...variantCost,
                                      },
                                  }),
                              ),
                          };
                      },
                  )
                : undefined,
        pricing_default_label: service.defaultCostVariantLabel,
        pricing_adjustments: service.billing?.adjustments?.map((rule) =>
            pricingAdjustmentInfoFromRule(rule, service),
        ),
        resolutions: service.resolutions ? [...service.resolutions] : undefined,
        // User-facing metadata from service definition
        title: service.title,
        description: service.description,
        input_modalities: service.inputModalities,
        output_modalities: service.outputModalities,
        required_safety: service.requiredSafetyFeatures,
        supported_endpoints: service.supportedEndpoints,
        video_capabilities: service.videoCapabilities,
        min_duration: service.minDuration,
        max_duration: service.maxDuration,
        default_duration: service.defaultDuration,
        allowed_durations: service.allowedDurations
            ? [...service.allowedDurations]
            : undefined,
        duration_step: service.durationStep,
        max_reference_images: service.maxReferenceImages,
        max_reference_videos: service.maxReferenceVideos,
        capabilities: getCapabilities(service),
        tools: service.tools,
        reasoning: service.reasoning,
        context_length: service.contextLength,
        voices: service.voices,
        is_specialized: service.isSpecialized,
        paid_only: service.paidOnly,
        alpha: service.alpha,
        flat_rate:
            service.flatRate ??
            (service.category === "image"
                ? service.cost.promptTextTokens === undefined
                : undefined),
        added_date: service.addedDate,
    };
}

/**
 * Get enriched model information for a service
 * Combines pricing from price definitions with metadata from service definition
 */
function getModelInfo(modelName: ModelName): ModelInfo {
    const service = getRegistryModelDefinition(modelName);
    return modelInfoFromDefinition(modelName, service);
}

/**
 * Get all text models with enriched information
 */
export function getTextModelsInfo(): ModelInfo[] {
    return getVisibleTextModels().map(getModelInfo);
}

/**
 * Get all image models with enriched information
 */
export function getImageModelsInfo(): ModelInfo[] {
    return getVisibleImageModels().map(getModelInfo);
}

/**
 * Get all audio models with enriched information
 */
export function getAudioModelsInfo(): ModelInfo[] {
    return getVisibleAudioModels().map(getModelInfo);
}

/**
 * Get all embedding models with enriched information
 */
export function getEmbeddingModelsInfo(): ModelInfo[] {
    return getVisibleEmbeddingModels().map(getModelInfo);
}

/**
 * Get all realtime models with enriched information
 */
export function getRealtimeModelsInfo(): ModelInfo[] {
    return getVisibleRealtimeModels().map(getModelInfo);
}

/**
 * Get all 3D models with enriched information
 */
export function getModel3dModelsInfo(): ModelInfo[] {
    return getVisibleModel3dModels().map(getModelInfo);
}
