import { z } from "zod";
import {
    getActivePriceDefinition,
    getImageServices,
    getServiceDefinition,
    getTextServices,
    ServiceId,
} from "./registry";

// Pricing uses registry field names directly, filtering out zero/undefined values
// Fields: promptTextTokens, promptCachedTokens, promptAudioTokens, promptImageTokens,
//         completionTextTokens, completionReasoningTokens, completionAudioTokens,
//         completionImageTokens, completionVideoSeconds, completionVideoTokens
export const ModelInfoSchema = z.object({
    name: z.string(),
    aliases: z.array(z.string()),
    pricing: z
        .record(z.string(), z.union([z.number(), z.literal("pollen")]))
        .and(z.object({ currency: z.literal("pollen") })),
    description: z.string().optional(),
    input_modalities: z.array(z.string()).optional(),
    output_modalities: z.array(z.string()).optional(),
    tools: z.boolean().optional(),
    reasoning: z.boolean().optional(),
    context_window: z.number().optional(),
    voices: z.array(z.string()).optional(),
    is_specialized: z.boolean().optional(),
});

export type ModelInfo = z.infer<typeof ModelInfoSchema>;

/**
 * Get enriched model information for a service
 * Combines pricing from price definitions with metadata from service definition
 */
export function getModelInfo(serviceId: ServiceId): ModelInfo {
    const service = getServiceDefinition(serviceId);
    const priceDefinition = getActivePriceDefinition(serviceId);
    if (!priceDefinition) {
        throw new Error(`No price definition found for service: ${serviceId}`);
    }
    // Filter out date, zero, and undefined values from price definition
    const { date: _date, ...priceFields } = priceDefinition;
    const pricing: Record<string, number | "pollen"> = { currency: "pollen" };
    for (const [key, value] of Object.entries(priceFields)) {
        if (typeof value === "number" && value > 0) {
            pricing[key] = value;
        }
    }

    return {
        name: serviceId as string,
        aliases: service.aliases,
        pricing,
        // User-facing metadata from service definition
        description: service.description,
        input_modalities: service.inputModalities,
        output_modalities: service.outputModalities,
        tools: service.tools,
        reasoning: service.reasoning,
        context_window: service.contextWindow,
        voices: service.voices,
        is_specialized: service.isSpecialized,
    };
}

/**
 * Get all text models with enriched information
 */
export function getTextModelsInfo(): ModelInfo[] {
    return getTextServices().map(getModelInfo);
}

/**
 * Get all image models with enriched information
 */
export function getImageModelsInfo(): ModelInfo[] {
    return getImageServices().map(getModelInfo);
}
