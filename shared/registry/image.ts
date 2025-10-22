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
            completionImageTokens: 0.000088, // $0.0088¢ per image (GPU cluster cost - September avg)
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
            completionImageTokens: 0.0027, // $0.0027 per image (Scaleway - FLUX schnell pricing from Together.AI)
        },
    ],
    "nanobanana": [
        // Gemini 2.5 Flash Image via Vertex AI (currently disabled)
        // $30 per 1M output tokens, 1290 tokens per image = $0.039 per image
        {
            date: PRICING_START_DATE,
            completionImageTokens: perMillion(30), // $30 per 1M tokens × 1290 tokens/image
        },
    ],
    "seedream": [
        // ByteDance ARK Seedream 4.0 (currently disabled)
        {
            date: PRICING_START_DATE,
            completionImageTokens: perMillion(30), // Estimated token-based pricing
        },
    ],
    "gptimage": [
        {
            date: PRICING_START_DATE,
            completionImageTokens: perMillion(8), // $8 per 1M output tokens (Azure gpt-image-1-mini)
        },
    ],
} as const satisfies ModelRegistry;

export const IMAGE_SERVICES = {
    "flux": {
        aliases: [],
        modelId: "flux",
        price: [ZERO_PRICE],
        provider: "io.net",
        tier: "seed",
    },
    "kontext": {
        aliases: [],
        modelId: "kontext",
        price: IMAGE_COSTS["kontext"],
        provider: "io.net",
        tier: "seed",
    },
    "turbo": {
        aliases: [],
        modelId: "turbo",
        price: IMAGE_COSTS["turbo"],
        provider: "io.net",
        tier: "seed",
    },
    // nanobanana: {
    //     aliases: [],
    //     modelId: "nanobanana",
    //     price: IMAGE_COSTS["nanobanana"],
    //     provider: "vertex-ai",
    //     tier: "nectar",
    // },
    // seedream: {
    //     aliases: [],
    //     modelId: "seedream",
    //     price: IMAGE_COSTS["seedream"],
    //     provider: "bytedance-ark",
    //     tier: "flower",
    // },
    "gptimage": {
        aliases: ["gpt-image", "gpt-image-1-mini"],
        modelId: "gptimage",
        price: IMAGE_COSTS["gptimage"],
        provider: "azure-openai",
        tier: "seed",
    },
} as const satisfies ServiceRegistry<typeof IMAGE_COSTS>;


