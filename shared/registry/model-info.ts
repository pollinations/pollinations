import { z } from "zod";
import {
    getActivePriceDefinition,
    getModelDefinition,
    getVisibleAudioModels,
    getVisibleEmbeddingModels,
    getVisibleImageModels,
    getVisibleTextModels,
    type ModelName,
} from "./registry";

// Pricing uses registry field names directly, filtering out zero/undefined values
// Fields: promptTextTokens, promptCachedTokens, promptAudioTokens, promptAudioSeconds,
//         promptImageTokens, completionTextTokens, completionReasoningTokens,
//         completionAudioTokens, completionImageTokens, completionVideoSeconds, completionVideoTokens
export const ModelInfoSchema = z.object({
    name: z.string(),
    aliases: z.array(z.string()),
    pricing: z
        .record(z.string(), z.string())
        .and(z.object({ currency: z.literal("pollen") })),
    description: z.string().optional(),
    input_modalities: z.array(z.string()).optional(),
    output_modalities: z.array(z.string()).optional(),
    video_capabilities: z.array(z.string()).optional(),
    tools: z.boolean().optional(),
    reasoning: z.boolean().optional(),
    context_length: z.number().optional(),
    voices: z.array(z.string()).optional(),
    is_specialized: z.boolean().optional(),
    paid_only: z.boolean().optional(),
});

export type ModelInfo = z.infer<typeof ModelInfoSchema>;

/**
 * Format a number to fixed-point string, avoiding scientific notation (e.g. 1.65e-7 → "0.000000165").
 * Strips trailing zeros for cleaner output.
 */
function toFixedPoint(n: number): string {
    return n.toFixed(12).replace(/\.?0+$/, "");
}

/**
 * Get enriched model information for a service
 * Combines pricing from price definitions with metadata from service definition
 */
export function getModelInfo(modelName: ModelName): ModelInfo {
    const service = getModelDefinition(modelName);
    const priceDefinition = getActivePriceDefinition(modelName);
    if (!priceDefinition) {
        throw new Error(`No price definition found for model: ${modelName}`);
    }
    // Filter out date, zero, and undefined values from price definition
    const { date: _date, ...priceFields } = priceDefinition;
    const pricing: Record<string, string> & { currency: "pollen" } = {
        currency: "pollen",
    };
    for (const [key, value] of Object.entries(priceFields)) {
        if (typeof value === "number" && value > 0) {
            pricing[key] = toFixedPoint(value);
        }
    }

    return {
        name: modelName as string,
        aliases: service.aliases,
        pricing,
        // User-facing metadata from service definition
        description: service.description,
        input_modalities: service.inputModalities,
        output_modalities: service.outputModalities,
        video_capabilities: service.videoCapabilities,
        tools: service.tools,
        reasoning: service.reasoning,
        context_length: service.contextLength,
        voices: service.voices,
        is_specialized: service.isSpecialized,
        paid_only: service.paidOnly,
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
