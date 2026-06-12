// Import registry for model names and tier validation
import type { ImageModelName } from "@shared/registry/image.ts";

/**
 * Image/Video-specific configuration for each model
 * Model names are enforced to match IMAGE_SERVICES from the registry
 * Tier/balance gating runs in this worker (auth/balance middleware +
 * utils/generation-access.ts) - this file only contains implementation details
 */
interface ImageModelConfig {
    type: string;
    defaultSideLength?: number; // Optional - defaults to 1024 if not specified
    minPixels?: number; // Minimum total pixels required (width * height)
    // Video-specific options
    isVideo?: boolean;
    defaultDuration?: number; // Default duration in seconds for video models
    maxDuration?: number; // Maximum duration in seconds
    defaultResolution?: "480p" | "720p" | "1080p";
}

type ImageModelsConfig = {
    [K in ImageModelName]: ImageModelConfig;
};

export const IMAGE_CONFIG = {
    // Azure Flux Kontext - general purpose model
    kontext: {
        type: "kontext",
        defaultSideLength: 1024,
    },

    // ByteDance Seedream 5.0 Lite via Replicate
    seedream5: {
        type: "replicate-seedream5",
        defaultSideLength: 2048,
        minPixels: 3686400, // Seedream 5.0 requires at least 1920x1920 pixels
    },

    // ByteDance Seedream 4.0 via Replicate
    seedream: {
        type: "replicate-seedream",
        defaultSideLength: 1024,
    },

    // ByteDance Seedream 4.5 Pro via Replicate
    "seedream-pro": {
        type: "replicate-seedream-pro",
        defaultSideLength: 2048,
        minPixels: 3686400, // Seedream 4.5 requires at least 1920x1920 pixels
    },

    // Gemini 2.5 Flash Image via Vertex AI - image-to-image generation
    nanobanana: {
        type: "vertex-ai",
        defaultSideLength: 1024,
    },

    // Gemini 3.1 Flash Image via Vertex AI - faster flash with pro-level quality (Nano Banana 2)
    "nanobanana-2": {
        type: "vertex-ai-2",
        defaultSideLength: 1024,
    },

    // Gemini 3 Pro Image via Vertex AI - high quality image generation (Nano Banana Pro)
    // Supports 1K, 2K, and 4K output resolutions
    "nanobanana-pro": {
        type: "vertex-ai-pro",
        defaultSideLength: 2048, // Default to 2K, supports up to 4K (3840x2160)
    },

    // Azure GPT Image model - gpt-image-1-mini
    gptimage: {
        type: "azure",
        defaultSideLength: 1021, // Prime number to detect default size for "auto" mode
    },

    // Azure GPT Image 1.5 - advanced image generation
    "gptimage-large": {
        type: "azure-gptimage-large",
        defaultSideLength: 1024,
    },

    // Azure GPT Image 2 - next-gen image generation
    "gpt-image-2": {
        type: "azure-gpt-image-2",
        defaultSideLength: 1024,
    },

    // Veo 3.1 Fast - Video generation via Vertex AI
    veo: {
        type: "vertex-ai-video",
        isVideo: true,
        defaultDuration: 4, // Cheapest option: 4 seconds
        maxDuration: 8,
        defaultResolution: "720p",
    },

    // ByteDance Seedance Pro-Fast via Replicate (was BytePlus ARK).
    // `seedance` (Lite) is retired — Replicate's lite endpoint reproducibly
    // fails (E004 1cah9wlWR9) and BytePlus is being deprecated.
    "seedance-pro": {
        type: "replicate-seedance-pro",
        isVideo: true,
        defaultDuration: 5,
        maxDuration: 10,
        defaultResolution: "720p",
    },

    // ByteDance Seedance 2.0 via Replicate - Multimodal video gen with native audio
    "seedance-2.0": {
        type: "replicate-seedance-2",
        isVideo: true,
        defaultDuration: 5,
        maxDuration: 15,
        defaultResolution: "720p",
    },

    // Alibaba Wan 2.6 via Replicate - 720p video with native audio
    wan: {
        type: "replicate-wan-video",
        isVideo: true,
        defaultDuration: 5,
        maxDuration: 15,
        defaultResolution: "720p",
    },

    // Alibaba Wan 2.2 via Replicate - fast/cheap 480p video (5s fixed, silent)
    "wan-fast": {
        type: "replicate-wan-video",
        isVideo: true,
        defaultDuration: 5,
        maxDuration: 5,
        defaultResolution: "480p",
    },

    // Alibaba Wan 2.7 via Replicate - 720p video with bundled audio + keyframes
    "wan-pro": {
        type: "replicate-wan-video",
        isVideo: true,
        defaultDuration: 5,
        maxDuration: 15,
        defaultResolution: "720p",
    },

    // Alibaba Wan 2.7 via Replicate - 1080p variant (one price: $0.15/s)
    "wan-pro-1080p": {
        type: "replicate-wan-video",
        isVideo: true,
        defaultDuration: 5,
        maxDuration: 15,
        defaultResolution: "1080p",
    },

    // Alibaba Wan 2.7 Image - Text-to-image and image editing (up to 2K)
    "wan-image": {
        type: "replicate-wan-image",
        defaultSideLength: 1024,
    },

    // Alibaba Wan 2.7 Image Pro - Text-to-image and editing (4K, thinking mode)
    "wan-image-pro": {
        type: "replicate-wan-image-pro",
        defaultSideLength: 2048,
    },

    // Alibaba Qwen Image Plus - Text-to-image and image editing
    "qwen-image": {
        type: "replicate-qwen-image",
        defaultSideLength: 1024,
    },

    // Grok Imagine - xAI official image generation
    "grok-imagine": {
        type: "xai-image",
        defaultSideLength: 1024,
    },

    // Grok Imagine Pro - xAI official pro image generation (Aurora)
    "grok-imagine-pro": {
        type: "xai-image-pro",
        defaultSideLength: 1024,
    },

    // Grok Video Pro - xAI official video generation (720p)
    "grok-video-pro": {
        type: "xai-video",
        isVideo: true,
        defaultDuration: 5,
        maxDuration: 15,
        defaultResolution: "720p",
    },

    // Z-Image - Fast 6B parameter image generation with SPAN 2x upscaling (IO.net)
    zimage: {
        type: "zimage",
        defaultSideLength: 1024,
    },

    // Flux Schnell - Fast high-quality image generation (Fireworks serverless)
    flux: {
        type: "flux",
        defaultSideLength: 1024,
    },

    // Klein - Fast 4B parameter model on RunPod (text-to-image + image editing)
    klein: {
        type: "runpod-klein",
        defaultSideLength: 1024,
    },

    // LTX-2 - Fast video generation on Lambda Labs GH200
    "ltx-2": {
        type: "vastai-ltx2",
        isVideo: true,
        defaultDuration: 5,
        maxDuration: 10,
        defaultResolution: "720p",
    },

    // Pruna p-image - Text-to-image generation
    "p-image": {
        type: "pruna",
        defaultSideLength: 1024,
    },

    // Pruna p-image-edit - Image-to-image editing
    "p-image-edit": {
        type: "pruna-edit",
        defaultSideLength: 1024,
    },

    // Pruna p-video - Text/image-to-video generation (720p / 1080p tiers)
    "p-video-720p": {
        type: "pruna-video-720p",
        isVideo: true,
        defaultDuration: 5,
        maxDuration: 10,
        defaultResolution: "720p",
    },
    "p-video-1080p": {
        type: "pruna-video-1080p",
        isVideo: true,
        defaultDuration: 5,
        maxDuration: 10,
        defaultResolution: "1080p",
    },

    // Amazon Nova Canvas - Bedrock image generation
    "nova-canvas": {
        type: "nova-canvas",
        defaultSideLength: 1024,
    },

    // Amazon Nova Reel - Bedrock video generation
    "nova-reel": {
        type: "nova-reel",
        isVideo: true,
        defaultDuration: 6,
        maxDuration: 120,
        defaultResolution: "720p",
    },
} as const satisfies ImageModelsConfig;

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
    const config = IMAGE_CONFIG[
        modelName as ImageModelName
    ] as ImageModelConfig;
    if (!config?.minPixels) {
        return { width, height };
    }
    return scaleToMinPixels(width, height, config.minPixels);
}
