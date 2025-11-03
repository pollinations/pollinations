import type {
    ModelRegistry,
    ServiceRegistry,
    UsageConversionDefinition,
} from "./registry";
import { ZERO_PRICE, PRICING_START_DATE, perMillion } from "./price-helpers";

export const IMAGE_COSTS = {
    "flux": [
        {
            date: PRICING_START_DATE,
            completionImageTokens: 0.00012, // $0.0088¢ per image (GPU cluster cost - September avg)
        },
    ],
    "kontext": [
        {
            date: PRICING_START_DATE,
            completionImageTokens: 0.04, // $0.04 per image (Azure pricing)
        },
    ],
    "turbo": [
        {
            date: PRICING_START_DATE,
            completionImageTokens: 0.0003, 
        },
    ],
    "nanobanana": [
        // Gemini 2.5 Flash Image via Vertex AI (currently disabled)
        // Token-based pricing (auto-detected by presence of promptTextTokens/promptImageTokens)
        {
            date: PRICING_START_DATE,
            promptTextTokens: perMillion(0.30), // $0.30 per 1M input tokens
            promptImageTokens: perMillion(0.30), // $0.30 per 1M input tokens
            completionImageTokens: perMillion(30), // $30 per 1M tokens × 1290 tokens/image = $0.039 per image
        },
    ],
    "seedream": [
        // ByteDance ARK Seedream 4.0
        {
            date: PRICING_START_DATE,
            completionImageTokens: 0.03, // $0.03 per image (3 cents)
        },
    ],
    "gptimage": [
        // Azure gpt-image-1-mini
        // Token-based pricing (auto-detected by presence of promptTextTokens/promptImageTokens)
        {
            date: PRICING_START_DATE,
            promptTextTokens: perMillion(2.0), // $2.00 per 1M text input tokens
            promptCachedTokens: perMillion(0.20), // $0.20 per 1M cached text input tokens
            promptImageTokens: perMillion(2.50), // $2.50 per 1M image input tokens
            completionImageTokens: perMillion(8), // $8.00 per 1M output tokens
        },
    ],
} as const satisfies ModelRegistry;

export const IMAGE_SERVICES = {
    flux: {
        aliases: [],
        modelId: "flux",
        free: true,
        provider: "io.net",
        tier: "seed",
        description: "Flux - Fast image generation",
        input_modalities: ["text"],
        output_modalities: ["image"],
    },
    kontext: {
        aliases: [],
        modelId: "kontext",
        provider: "azure",
        tier: "seed",
        description: "Kontext - Azure image generation",
        input_modalities: ["text", "image"],
        output_modalities: ["image"],
    },
    turbo: {
        aliases: [],
        modelId: "turbo",
        provider: "scaleway",
        tier: "seed",
        description: "Turbo - Fast image generation",
        input_modalities: ["text"],
        output_modalities: ["image"],
    },
    nanobanana: {
        aliases: [],
        modelId: "nanobanana",
        provider: "vertex-ai",
        tier: "nectar",
        description: "Nanobanana - Gemini 2.5 Flash Image via Vertex AI",
        input_modalities: ["text", "image"],
        output_modalities: ["image"],
    },
    seedream: {
        aliases: [],
        modelId: "seedream",
        provider: "bytedance-ark",
        tier: "nectar",
        description: "Seedream 4.0 - ByteDance ARK image generation",
        input_modalities: ["text"],
        output_modalities: ["image"],
    },
    gptimage: {
        aliases: ["gpt-image", "gpt-image-1-mini"],
        modelId: "gptimage",
        provider: "azure-openai",
        tier: "seed",
        description: "GPT Image 1 Mini - Azure OpenAI image generation",
        input_modalities: ["text", "image"],
        output_modalities: ["image"],
    },
} as const satisfies ServiceRegistry<typeof IMAGE_COSTS>;


