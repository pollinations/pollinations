import { COST_START_DATE, perMillion } from "./price-helpers";

export const DEFAULT_IMAGE_MODEL = "flux" as const;

export type ImageServiceId = keyof typeof IMAGE_SERVICES;
export type ImageModelId = (typeof IMAGE_SERVICES)[ImageServiceId]["modelId"];

export const IMAGE_SERVICES = {
    "flux": {
        aliases: [],
        modelId: "flux", // Provider returns this - used for cost lookup
        provider: "io.net",
        cost: [
            {
                date: COST_START_DATE,
                completionImageTokens: 0.00012, // $0.0088¢ per image (GPU cluster cost - September avg)
            },
        ],
        description: "Flux - Fast and high-quality image generation",
        input_modalities: ["text"],
        output_modalities: ["image"],
    },
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
        input_modalities: ["text", "image"],
        output_modalities: ["image"],
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
        description: "Turbo - Ultra-fast image generation",
        input_modalities: ["text"],
        output_modalities: ["image"],
    },
    "nanobanana": {
        aliases: [],
        modelId: "nanobanana",
        provider: "vertex-ai",
        cost: [
            // Gemini 2.5 Flash Image via Vertex AI (currently disabled)
            {
                date: COST_START_DATE,
                promptTextTokens: perMillion(0.3), // $0.30 per 1M input tokens
                promptImageTokens: perMillion(0.3), // $0.30 per 1M input tokens
                completionImageTokens: perMillion(30), // $30 per 1M tokens × 1290 tokens/image = $0.039 per image
            },
        ],
        description: "NanoBanana - Gemini 2.5 Flash Image (currently disabled)",
        input_modalities: ["text", "image"],
        output_modalities: ["image"],
    },
    "seedream": {
        aliases: [],
        modelId: "seedream",
        provider: "bytedance-ark",
        cost: [
            // ByteDance ARK Seedream 4.0
            {
                date: COST_START_DATE,
                completionImageTokens: 0.03, // $0.03 per image (3 cents)
            },
        ],
        description: "Seedream 4.0 - ByteDance ARK",
        input_modalities: ["text", "image"],
        output_modalities: ["image"],
    },
    "gptimage": {
        aliases: ["gpt-image", "gpt-image-1-mini"],
        modelId: "gptimage",
        provider: "azure-openai",
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
        input_modalities: ["text", "image"],
        output_modalities: ["image"],
    },
    "veo": {
        aliases: ["veo-3.1-fast", "video"],
        modelId: "veo",
        provider: "vertex-ai",
        cost: [
            // Veo 3.1 Fast - $0.15 per second of video
            // We bill by "video seconds" - each second is counted like a token
            {
                date: COST_START_DATE,
                completionVideoSeconds: 0.15, // $0.15 per second of video
            },
        ],
        description: "Veo 3.1 Fast - Google's video generation model",
        input_modalities: ["text"],
        output_modalities: ["video"],
    },
} as const;
