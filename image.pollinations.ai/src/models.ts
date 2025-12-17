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
    defaultSideLength?: number; // Optional - defaults to maxSideLength if not specified
    tierCaps?: {
        seed?: number;
        flower?: number;
        nectar?: number;
    };
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
        type: "kontext",
        enhance: true,
        maxSideLength: 1024, // Azure Flux Kontext standard resolution
        tierCaps: {
            seed: 1,      // Base limit (minimum tier required)
            flower: 2,    // Double the seed tier
            nectar: 2,    // Same as flower tier
        },
    },

    // Assuming 'turbo' is of type 'sd'
    turbo: {
        type: "pollinations",
        enhance: true,
        maxSideLength: 768,
    },

    // ByteDance ARK Seedream - high quality image generation
    seedream: {
        type: "seedream",
        enhance: false,
        maxSideLength: 4096, // Seedream supports up to 4K
        defaultSideLength: 1024, // Default to 1K when not specified
    },

    // Gemini 2.5 Flash Image via Vertex AI - image-to-image generation
    nanobanana: {
        type: "vertex-ai",
        enhance: false,
        maxSideLength: 2048, // Gemini supports up to 2K
        defaultSideLength: 1024,
    },

    // Disabled - available via enter.pollinations.ai
    // gptimage: {
    //     type: "azure",
    //     enhance: false,
    //     maxSideLength: 1024,
    // },
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
