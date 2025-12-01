// Import registry for model names and tier validation
import { type ImageServiceId } from "../../shared/registry/image.ts";

/**
 * Image/Video-specific configuration for each model
 * Model names are enforced to match IMAGE_SERVICES from the registry
 * Tier gating is handled by enter.pollinations.ai - this only contains implementation details
 */
interface ImageModelConfig {
    type: string;
    enhance: boolean;
    defaultSideLength?: number; // Optional - defaults to 1024 if not specified
    // Video-specific options
    isVideo?: boolean;
    defaultDuration?: number; // Default duration in seconds for video models
    maxDuration?: number; // Maximum duration in seconds
    defaultResolution?: "720p" | "1080p";
}

type ImageModelsConfig = {
    [K in ImageServiceId]: ImageModelConfig;
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

    // Gemini 3 Pro Image via Vertex AI - high quality image generation (Nano Banana Pro)
    // Supports 1K, 2K, and 4K output resolutions
    "nanobanana-pro": {
        type: "vertex-ai-pro",
        enhance: false,
        defaultSideLength: 2048, // Default to 2K, supports up to 4K (3840x2160)
    },

    // Azure GPT Image model - gpt-image-1-mini
    gptimage: {
        type: "azure",
        enhance: false,
        defaultSideLength: 1021, // Prime number to detect default size for "auto" mode
    },

    // Veo 3.1 Fast - Video generation via Vertex AI
    veo: {
        type: "vertex-ai-video",
        enhance: false,
        isVideo: true,
        defaultDuration: 4, // Cheapest option: 4 seconds
        maxDuration: 8,
        defaultResolution: "720p",
    },

    // BytePlus Seedance - Video generation
    seedance: {
        type: "bytedance-ark-video",
        enhance: false,
        isVideo: true,
        defaultDuration: 5,
        maxDuration: 10,
        defaultResolution: "720p",
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
) as Record<ImageServiceId, ImageModelConfig>;
