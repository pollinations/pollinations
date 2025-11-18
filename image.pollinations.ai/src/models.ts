// Import registry for model names and tier validation
import { type ImageServiceName } from "../../shared/registry/image.ts";

/**
 * Image-specific configuration for each model
 * Model names are enforced to match IMAGE_SERVICES from the registry
 * Tier gating is handled by enter.pollinations.ai - this only contains implementation details
 */
interface ImageModelConfig {
    type: string;
    enhance: boolean;
    defaultSideLength?: number; // Optional - defaults to 1024 if not specified
}

type ImageModelsConfig = {
    [K in ImageServiceName]: ImageModelConfig;
};

export const IMAGE_CONFIG = {
    flux: {
        type: "pollinations",
        enhance: true,
        defaultSideLength: 768,
    },

    // Azure Flux Kontext - general purpose model
    kontext: {
        type: "kontext",
        enhance: true,
        defaultSideLength: 1024,
    },

    // Assuming 'turbo' is of type 'sd'
    turbo: {
        type: "pollinations",
        enhance: true,
        defaultSideLength: 768,
    },

    // ByteDance ARK Seedream - high quality image generation
    seedream: {
        type: "seedream",
        enhance: false,
        defaultSideLength: 1024,
    },

    // Gemini 2.5 Flash Image via Vertex AI - image-to-image generation
    nanobanana: {
        type: "vertex-ai",
        enhance: false,
        defaultSideLength: 1024,
    },

    // Azure GPT Image model - gpt-image-1-mini
    gptimage: {
        type: "azure",
        enhance: false,
        defaultSideLength: 1021, // Prime number to detect default size for "auto" mode
    },
} as const satisfies ImageModelsConfig;

/**
 * Legacy MODELS export for backward compatibility
 * Combines registry data with local config (enhance, defaultSideLength)
 * @deprecated Use IMAGE_SERVICES from registry, IMAGE_CONFIG for implementation details
 */
export const MODELS = Object.fromEntries(
    Object.entries(IMAGE_CONFIG).map(([name, config]) => [
        name,
        {
            ...config,
        },
    ]),
) as Record<ImageServiceName, ImageModelConfig>;
