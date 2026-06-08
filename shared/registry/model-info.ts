import { z } from "zod";
import {
    getModelDefinition,
    getPriceDefinition,
    getVisibleAudioModels,
    getVisibleEmbeddingModels,
    getVisibleImageModels,
    getVisibleRealtimeModels,
    getVisibleTextModels,
    type ModelName,
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
        "embedding",
        "realtime",
    ]),
    brand: z.string(),
    pricing: z
        .record(z.string(), z.string())
        .and(z.object({ currency: z.literal("pollen") })),
    billing_policy: z
        .object({
            id: z.string(),
            description: z.string(),
        })
        .optional(),
    title: z.string(),
    description: z.string().optional(),
    input_modalities: z.array(z.string()).optional(),
    output_modalities: z.array(z.string()).optional(),
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

function getCapabilities(
    service: ReturnType<typeof getModelDefinition>,
): ModelCapability[] {
    const capabilities: ModelCapability[] = [];
    if (service.tools) capabilities.push("tool_calling");
    if (service.reasoning) capabilities.push("reasoning");
    if (service.search) capabilities.push("web_search");
    if (service.codeExecution) capabilities.push("code_execution");
    return capabilities;
}

/**
 * Get enriched model information for a service
 * Combines pricing from price definitions with metadata from service definition
 */
function getModelInfo(modelName: ModelName): ModelInfo {
    const service = getModelDefinition(modelName);
    const priceDefinition = getPriceDefinition(modelName);
    if (!priceDefinition) {
        throw new Error(`No price definition found for model: ${modelName}`);
    }
    const pricing: Record<string, string> & { currency: "pollen" } = {
        currency: "pollen",
    };
    for (const [key, value] of Object.entries(priceDefinition)) {
        if (typeof value === "number" && value > 0) {
            pricing[key] = toFixedPoint(value);
        }
    }

    return {
        name: modelName as string,
        aliases: service.aliases,
        category: service.category,
        brand: service.brand,
        pricing,
        billing_policy: service.billingPolicy
            ? {
                  id: service.billingPolicy.id,
                  description: service.billingPolicy.description,
              }
            : undefined,
        // User-facing metadata from service definition
        title: service.title,
        description: service.description,
        input_modalities: service.inputModalities,
        output_modalities: service.outputModalities,
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
        added_date: service.addedDate,
    };
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
