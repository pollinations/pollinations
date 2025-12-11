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
    minPixels?: number; // Minimum total pixels required (width * height)
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

    // ByteDance ARK Seedream 4.0 - better quality (default)
    seedream: {
        type: "seedream",
        enhance: false,
        defaultSideLength: 1024, // Seedream 4.0 standard resolution
    },

    // ByteDance ARK Seedream 4.5 Pro - high quality 4K image generation
    "seedream-pro": {
        type: "seedream-pro",
        enhance: false,
        defaultSideLength: 2048, // Seedream 4.5 supports up to 4K
        minPixels: 3686400, // Seedream 4.5 requires at least 1920x1920 pixels
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

    // BytePlus Seedance Lite - Video generation (default, better quality)
    seedance: {
        type: "bytedance-ark-video",
        enhance: false,
        isVideo: true,
        defaultDuration: 5,
        maxDuration: 10,
        defaultResolution: "720p",
    },

    // BytePlus Seedance Pro-Fast - Video generation (better prompt adherence)
    "seedance-pro": {
        type: "bytedance-ark-video-pro",
        enhance: false,
        isVideo: true,
        defaultDuration: 5,
        maxDuration: 10,
        defaultResolution: "720p",
    },

    // Z-Image-Turbo - Fast 6B parameter image generation (self-hosted)
    zimage: {
        type: "zimage",
        enhance: false,
        defaultSideLength: 1024,
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

/**
 * Scale up dimensions to meet minimum pixel requirements while preserving aspect ratio
 * @param width - Original width
 * @param height - Original height
 * @param minPixels - Minimum total pixels required
 * @returns Scaled dimensions that meet the minimum requirement
 */
export function scaleToMinPixels(
    width: number,
    height: number,
    minPixels: number,
): { width: number; height: number } {
    const currentPixels = width * height;
    if (currentPixels >= minPixels) {
        return { width, height };
    }

    // Calculate scale factor to reach minimum pixels
    const scaleFactor = Math.sqrt(minPixels / currentPixels);
    return {
        width: Math.ceil(width * scaleFactor),
        height: Math.ceil(height * scaleFactor),
    };
}

/**
 * Get scaled dimensions for a model if it has minimum pixel requirements
 * @param modelName - Name of the model
 * @param width - Requested width
 * @param height - Requested height
 * @returns Scaled dimensions or original if no minimum requirement
 */
export function getScaledDimensions(
    modelName: string,
    width: number,
    height: number,
): { width: number; height: number } {
    const config = MODELS[modelName as ImageServiceId];
    if (!config?.minPixels) {
        return { width, height };
    }
    return scaleToMinPixels(width, height, config.minPixels);
}
