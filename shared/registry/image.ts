import type {
    ModelRegistry,
    ServiceRegistry,
    UsageConversionDefinition,
} from "./registry";
import { PRICING_START_DATE, perMillion } from "./price-helpers";

export const DEFAULT_IMAGE_MODEL = "flux" as const;

export const IMAGE_COSTS = {
    "flux": [
        {
            date: PRICING_START_DATE,
            provider: "io.net",
            completionImageTokens: 0.00012, // $0.0088¢ per image (GPU cluster cost - September avg)
        },
    ],
    "kontext": [
        {
            date: PRICING_START_DATE,
            provider: "azure",
            completionImageTokens: 0.04, // $0.04 per image (Azure pricing)
        },
    ],
    "turbo": [
        {
            date: PRICING_START_DATE,
            provider: "scaleway",
            completionImageTokens: 0.0003,
        },
    ],
    "nanobanana": [
        // Gemini 2.5 Flash Image via Vertex AI (currently disabled)
        {
            date: PRICING_START_DATE,
            provider: "vertex-ai",
            promptTextTokens: perMillion(0.3), // $0.30 per 1M input tokens
            promptImageTokens: perMillion(0.3), // $0.30 per 1M input tokens
            completionImageTokens: perMillion(30), // $30 per 1M tokens × 1290 tokens/image = $0.039 per image
        },
    ],
    "seedream": [
        // ByteDance ARK Seedream 4.0
        {
            date: PRICING_START_DATE,
            provider: "bytedance-ark",
            completionImageTokens: 0.03, // $0.03 per image (3 cents)
        },
    ],
    "gptimage": [
        // Azure gpt-image-1-mini
        {
            date: PRICING_START_DATE,
            provider: "azure-openai",
            promptTextTokens: perMillion(2.0), // $2.00 per 1M text input tokens
            promptCachedTokens: perMillion(0.2), // $0.20 per 1M cached text input tokens
            promptImageTokens: perMillion(2.5), // $2.50 per 1M image input tokens
            completionImageTokens: perMillion(8), // $8.00 per 1M output tokens
        },
    ],
} as const satisfies ModelRegistry;

export const IMAGE_SERVICES = {
    "flux": {
        aliases: [],
        modelId: "flux",
        description: "Flux - Fast and high-quality image generation",
        input_modalities: ["text"],
        output_modalities: ["image"],
    },
    "kontext": {
        aliases: [],
        modelId: "kontext",
        description: "Kontext - Context-aware image generation",
        input_modalities: ["text"],
        output_modalities: ["image"],
    },
    "turbo": {
        aliases: [],
        modelId: "turbo",
        description: "Turbo - Ultra-fast image generation",
        input_modalities: ["text"],
        output_modalities: ["image"],
    },
    nanobanana: {
        aliases: [],
        modelId: "nanobanana",
        description: "NanoBanana - Gemini 2.5 Flash Image (currently disabled)",
        input_modalities: ["text", "image"],
        output_modalities: ["image"],
        hidden: true,
    },
    seedream: {
        aliases: [],
        modelId: "seedream",
        description: "Seedream 4.0 - ByteDance ARK",
        input_modalities: ["text"],
        output_modalities: ["image"],
    },
    "gptimage": {
        aliases: ["gpt-image", "gpt-image-1-mini"],
        modelId: "gptimage",
        description: "GPT Image 1 Mini - OpenAI's image generation model",
        input_modalities: ["text", "image"],
        output_modalities: ["image"],
    },
} as const satisfies ServiceRegistry<typeof IMAGE_COSTS>;
