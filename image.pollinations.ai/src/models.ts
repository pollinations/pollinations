// Import registry for model names and tier validation
import { IMAGE_SERVICES } from "../../shared/registry/image.ts";

// Type constraint: model names must exist in registry
type ImageServiceName = keyof typeof IMAGE_SERVICES;

/**
 * Image-specific configuration for each model
 * Model names are enforced to match IMAGE_SERVICES from the registry
 * Tier information comes from the registry - this only contains implementation details
 */
interface ImageModelConfig {
    type: string;
    enhance: boolean;
    maxSideLength: number;
}

type ImageModelsConfig = {
    [K in ImageServiceName]: ImageModelConfig;
};

export const IMAGE_CONFIG: ImageModelsConfig = {
    flux: {
        type: "pollinations",
        enhance: true,
        maxSideLength: 768,
    },

    // Azure Flux Kontext - general purpose model
    kontext: {
        type: "azure-flux-kontext",
        enhance: true,
        maxSideLength: 1024, // Azure Flux Kontext standard resolution
    },

    // Assuming 'turbo' is of type 'sd'
    turbo: {
        type: "pollinations",
        enhance: true,
        maxSideLength: 768,
    },

    // Azure GPT Image model - gpt-image-1-mini
    gptimage: {
        type: "azure",
        enhance: false,
        maxSideLength: 1024,
    },
};

/**
 * Legacy export for backward compatibility
 * Combines registry data (tier, pricing) with local config (enhance, maxSideLength)
 * @deprecated Use IMAGE_SERVICES from registry for tier info, IMAGE_CONFIG for implementation details
 */
export const MODELS = Object.fromEntries(
    Object.entries(IMAGE_CONFIG).map(([name, config]) => [
        name,
        {
            ...config,
            tier: IMAGE_SERVICES[name as ImageServiceName].tier,
        },
    ])
) as Record<ImageServiceName, ImageModelConfig & { tier: typeof IMAGE_SERVICES[ImageServiceName]["tier"] }>;
