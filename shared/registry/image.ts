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
        description: "FLUX.1 Kontext - In-context editing & generation",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "turbo": {
        aliases: [],
        modelId: "turbo",
        provider: "scaleway",
        cost: [
            {
                date: COST_START_DATE,
                completionImageTokens: 0.0003,
            },
        ],
        description: "SDXL Turbo - Single-step real-time generation",
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
        paidOnly: true,
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
        paidOnly: true,
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
    "flux": {
        aliases: [],
        modelId: "flux",
        provider: "io.net",
        cost: [
            // Flux Schnell (nunchaku-quantized) on io.net RTX 4090 cluster
            {
                date: COST_START_DATE,
                completionImageTokens: 0.0002, // ~$0.0002 per image (GPU cost estimate)
            },
        ],
        description: "Flux Schnell - Fast high-quality image generation",
        inputModalities: ["text"],
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
        description: "Z-Image Turbo - Fast 6B Flux with 2x upscaling",
        inputModalities: ["text"],
        outputModalities: ["image"],
    },
    "veo": {
        aliases: ["veo-3.1-fast", "video"],
        modelId: "veo",
        provider: "google",
        paidOnly: true,
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
    "wan": {
        aliases: ["wan2.6", "wan-i2v"],
        modelId: "wan",
        provider: "alibaba",
        cost: [
            // Wan 2.6 I2V Flash (Singapore/International region)
            // Video base: 720P $0.025/sec (without audio)
            // Audio add-on: $0.025/sec (when audio=true)
            // Total with audio: $0.05/sec
            {
                date: new Date("2026-01-20").getTime(), // Launch date
                completionVideoSeconds: 0.025, // $0.025 per second (video only)
                completionAudioSeconds: 0.025, // $0.025 per second of audio
            },
        ],
        description:
            "Wan 2.6 - Alibaba image-to-video with audio (2-15s, up to 1080P)",
        inputModalities: ["text", "image"],
        outputModalities: ["video"],
    },
    "klein": {
        aliases: ["flux-klein"],
        modelId: "klein",
        provider: "modal",
        cost: [
            // Flux Klein on Modal L40S GPU
            // L40S: $0.000542/sec × 15s avg (including cold starts) = $0.008/image
            {
                date: new Date("2026-01-21").getTime(), // Launch date
                completionImageTokens: 0.008, // ~$0.008 per image (L40S @ 15s avg)
            },
        ],
        description:
            "FLUX.2 Klein 4B - Fast image generation & editing on Modal",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
    "klein-large": {
        aliases: ["flux-klein-9b", "klein-9b"],
        modelId: "klein-large",
        provider: "modal",
        cost: [
            // Flux Klein 9B on Modal L40S GPU (~$0.012/image with cold starts)
            {
                date: new Date("2026-01-21").getTime(),
                completionImageTokens: 0.012,
            },
        ],
        description:
            "FLUX.2 Klein 9B - Higher quality image generation & editing on Modal",
        inputModalities: ["text", "image"],
        outputModalities: ["image"],
    },
} as const satisfies Record<string, ServiceDefinition<string>>;
