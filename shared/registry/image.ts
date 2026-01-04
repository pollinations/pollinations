import { COST_START_DATE, perMillion } from "./price-helpers";
import type { ServiceDefinition } from "./registry";

export const DEFAULT_IMAGE_MODEL = "zimage" as const;

export type ImageServiceId = keyof typeof IMAGE_SERVICES;
export type ImageModelId = (typeof IMAGE_SERVICES)[ImageServiceId]["modelId"];

export const IMAGE_SERVICES = {
    "kontext": {
        aliases: [],
        modelId: "kontext",
        provider: "azure",
        cost: [
            {
                date: COST_START_DATE,
                completionImageTokens: 0.04, // $0.04 per image (Azure pricing)
            },
        ],
        description: "Kontext - Context-aware image generation",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "turbo": {
        aliases: ["sdxl-turbo", "SDXL-turbo"],
        modelId: "turbo",
        provider: "scaleway",
        cost: [
            {
                date: COST_START_DATE,
                completionImageTokens: 0.0003,
            },
        ],
        description: "Turbo - SDXL-turbo ultra-fast image generation",
        inputModalities: ["text"],
        outputModalities: ["image"],
    },
    "nanobanana": {
        aliases: [],
        modelId: "nanobanana",
        provider: "google",
        cost: [
            // Gemini 2.5 Flash Image via Vertex AI
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.3), // $0.30 per 1M input tokens
                promptImageTokens: perMillion(0.3), // $0.30 per 1M input tokens
                completionImageTokens: perMillion(30), // $30 per 1M tokens × 1290 tokens/image = $0.039 per image
            },
        ],
        description: "NanoBanana - Gemini 2.5 Flash Image",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "nanobanana-pro": {
        aliases: [],
        modelId: "nanobanana-pro",
        provider: "google",
        cost: [
            // Gemini 3 Pro Image via Vertex AI
            // 1K/2K image: 1120 tokens = $0.134/image ($120/M tokens)
            // 4K image: 2000 tokens = $0.24/image
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(1.25), // $1.25 per 1M input tokens
                promptImageTokens: perMillion(1.25), // $1.25 per 1M input tokens
                completionImageTokens: perMillion(120), // $120 per 1M tokens = $0.134 per 1K image
            },
        ],
        description: "NanoBanana Pro - Gemini 3 Pro Image (4K, Thinking)",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "seedream": {
        aliases: [],
        modelId: "seedream",
        provider: "bytedance",
        cost: [
            // ByteDance ARK Seedream 4.0 - $0.03 per image
            {
                date: COST_START_DATE,
                completionImageTokens: 0.03, // $0.03 per image (3 cents)
            },
        ],
        description: "Seedream 4.0 - ByteDance ARK (better quality)",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "seedream-pro": {
        aliases: [],
        modelId: "seedream-pro",
        provider: "bytedance",
        cost: [
            // ByteDance ARK Seedream 4.5 - $0.04 per image
            {
                date: COST_START_DATE,
                completionImageTokens: 0.04, // $0.04 per image (4 cents)
            },
        ],
        description: "Seedream 4.5 Pro - ByteDance ARK (4K, Multi-Image)",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "gptimage": {
        aliases: ["gpt-image", "gpt-image-1-mini"],
        modelId: "gptimage",
        provider: "azure-2",
        cost: [
            // Azure gpt-image-1-mini
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(2.0), // $2.00 per 1M text input tokens
                promptCachedTokens: perMillion(0.2), // $0.20 per 1M cached text input tokens
                promptImageTokens: perMillion(2.5), // $2.50 per 1M image input tokens
                completionImageTokens: perMillion(8), // $8.00 per 1M output tokens
            },
        ],
        description: "GPT Image 1 Mini - OpenAI's image generation model",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "gptimage-large": {
        aliases: ["gpt-image-1.5", "gpt-image-large"],
        modelId: "gptimage-large",
        provider: "azure",
        cost: [
            // Azure GPT Image 1.5 (via AI Foundry)
            // Official pricing: https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/introducing-openai%E2%80%99s-gpt-image-1-5-in-microsoft-foundry/4478139
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(8), // $8.00 per 1M input tokens (Azure)
                promptCachedTokens: perMillion(2), // $2.00 per 1M cached input tokens (Azure)
                promptImageTokens: perMillion(8), // $8.00 per 1M image input tokens (Azure)
                completionImageTokens: perMillion(32), // $32.00 per 1M output tokens (Azure)
            },
        ],
        description: "GPT Image 1.5 - OpenAI's advanced image generation model",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "zimage": {
        aliases: ["z-image", "z-image-turbo"],
        modelId: "zimage",
        provider: "io.net",
        cost: [
            // Z-Image-Turbo (6B params, 9 steps) with SPAN 2x upscaling
            // IO.net cluster (10x RTX 4090), ~1s for 768x768, ~2s for 1536x1536
            {
                date: COST_START_DATE,
                completionImageTokens: 0.0002, // ~$0.0002 per image (GPU cost estimate)
            },
        ],
        description:
            "Z-Image - Fast 6B parameter image generation with SPAN 2x upscaling",
        inputModalities: ["text"],
        outputModalities: ["image"],
    },
    "veo": {
        aliases: ["veo-3.1-fast", "video"],
        modelId: "veo",
        provider: "google",
        cost: [
            // Veo 3.1 Fast - $0.15 per second of video
            // We bill by "video seconds" - each second is counted like a token
            {
                date: COST_START_DATE,
                completionVideoSeconds: 0.15, // $0.15 per second of video
            },
        ],
        description: "Veo 3.1 Fast - Google's video generation model (preview)",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
    },
    "seedance": {
        aliases: [],
        modelId: "seedance",
        provider: "bytedance",
        cost: [
            // Seedance Lite - $1.8/M tokens
            // Token formula: (height × width × FPS × duration) / 1024
            {
                date: COST_START_DATE,
                completionVideoTokens: perMillion(1.8), // $1.8 per 1M tokens
            },
        ],
        description:
            "Seedance Lite - BytePlus video generation (better quality)",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
    },
    "seedance-pro": {
        aliases: [],
        modelId: "seedance-pro",
        provider: "bytedance",
        cost: [
            // Seedance Pro-Fast - $1/M tokens
            // Token formula: (height × width × FPS × duration) / 1024
            {
                date: COST_START_DATE,
                completionVideoTokens: perMillion(1.0), // $1.0 per 1M tokens
            },
        ],
        description:
            "Seedance Pro-Fast - BytePlus video generation (better prompt adherence)",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
    },
    // Legacy models - older versions still accessible
    "flux-pro": {
        aliases: ["flux-1-pro"],
        modelId: "flux-pro",
        provider: "replicate",
        cost: [
            {
                date: COST_START_DATE,
                completionImageTokens: 0.055, // $0.055 per image
            },
        ],
        description: "Flux Pro - Previous Generation (Legacy)",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "flux-dev": {
        aliases: ["flux-1-dev"],
        modelId: "flux-dev",
        provider: "replicate",
        cost: [
            {
                date: COST_START_DATE,
                completionImageTokens: 0.025, // $0.025 per image
            },
        ],
        description: "Flux Dev - Previous Generation (Legacy)",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "flux-schnell": {
        aliases: ["flux-1-schnell"],
        modelId: "flux-schnell",
        provider: "replicate",
        cost: [
            {
                date: COST_START_DATE,
                completionImageTokens: 0.003, // $0.003 per image
            },
        ],
        description: "Flux Schnell - Previous Generation (Legacy)",
        inputModalities: ["text"],
        outputModalities: ["image"],
    },
    "dall-e-3": {
        aliases: ["dalle-3"],
        modelId: "dall-e-3",
        provider: "azure",
        cost: [
            {
                date: COST_START_DATE,
                completionImageTokens: 0.08, // $0.08 per 1024x1024 image
            },
        ],
        description: "OpenAI DALL-E 3 - Previous Generation (Legacy)",
        inputModalities: ["text"],
        outputModalities: ["image"],
    },
    "stable-diffusion-xl": {
        aliases: ["sdxl", "sdxl-1.0"],
        modelId: "stable-diffusion-xl",
        provider: "replicate",
        cost: [
            {
                date: COST_START_DATE,
                completionImageTokens: 0.009, // $0.009 per image
            },
        ],
        description: "Stable Diffusion XL - Previous Generation (Legacy)",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
} as const satisfies Record<string, ServiceDefinition<string>>;
