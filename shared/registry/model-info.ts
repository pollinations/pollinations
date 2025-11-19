import { z } from "zod";
import {
    getActivePriceDefinition,
    getImageServices,
    getServiceDefinition,
    getTextServices,
    ServiceId,
} from "./registry";

export const ModelInfoSchema = z.object({
    name: z.string(),
    aliases: z.array(z.string()),
    pricing: z.object({
        input_token_price: z.number().optional(),
        output_token_price: z.number().optional(),
        cached_token_price: z.number().optional(),
        image_price: z.number().optional(),
        audio_input_price: z.number().optional(),
        audio_output_price: z.number().optional(),
        currency: z.literal("pollen"),
    }),
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
    return {
        name: serviceId as string,
        aliases: service.aliases,
        pricing: {
            input_token_price: priceDefinition.promptTextTokens,
            output_token_price: priceDefinition.completionTextTokens,
            cached_token_price: priceDefinition.promptCachedTokens,
            image_price: priceDefinition.completionImageTokens,
            audio_input_price: priceDefinition.promptAudioTokens,
            audio_output_price: priceDefinition.completionAudioTokens,
            currency: "pollen",
        },
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
