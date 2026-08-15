import { z } from "zod";
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
    type ModelDefinition,
    type ModelName,
    type PriceDefinition,
} from "./registry";

export const ModelCapabilitySchema = z.enum([
    "tool_calling",
    "reasoning",
    "web_search",
    "code_execution",
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
    category: z.enum([
        "text",
        "image",
        "audio",
        "video",
        "3d",
        "embedding",
        "realtime",
    ]),
    brand: z.string(),
    brand_url: z.string().url().optional(),
    community: z.boolean().optional(),
    agent: z.boolean().optional(),
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
    input_modalities: z.array(z.string()).optional(),
    output_modalities: z.array(z.string()).optional(),
    supported_endpoints: z.array(z.string()).optional(),
    video_capabilities: z.array(z.string()).optional(),
    max_reference_images: z.number().int().positive().optional(),
    max_reference_videos: z.number().int().positive().optional(),
    capabilities: z.array(ModelCapabilitySchema),
    tools: z.boolean().optional(),
    reasoning: z.boolean().optional(),
    context_length: z.number().optional(),
    voices: z.array(z.string()).optional(),
    is_specialized: z.boolean().optional(),
    paid_only: z.boolean().optional(),
    alpha: z.boolean().optional(),
    flat_rate: z.boolean().optional(),
    added_date: z.number().optional(),
});

export type ModelInfo = z.infer<typeof ModelInfoSchema>;

/**
 * Format a number to fixed-point string, avoiding scientific notation (e.g. 1.65e-7 → "0.000000165").
 * Strips trailing zeros for cleaner output.
 */
function toFixedPoint(n: number): string {
    return n.toFixed(12).replace(/\.?0+$/, "");
}

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
    perUserRpm?: number | null;
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
    const { label, quantity, unit, suffix, option } = rule.publicPricing;
    return {
        name: rule.id,
        label,
        kind: rule.kind,
        price: toFixedPoint(rule.unitCost * quantity * service.priceMultiplier),
        currency: "pollen" as const,
        quantity,
        unit,
        suffix,
        option,
    };
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
        per_user_rpm: options.perUserRpm,
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
        supported_endpoints: service.supportedEndpoints,
        video_capabilities: service.videoCapabilities,
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
