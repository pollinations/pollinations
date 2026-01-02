import type {
    ModelRegistry,
    ServiceRegistry,
    UsageConversionDefinition,
} from "./registry";
import { ZERO_PRICE, PRICING_START_DATE, perMillion } from "./price-helpers";

export const IMAGE_COSTS = {
    "sana": [
        {
            date: PRICING_START_DATE,
            completionImageTokens: 0.0002, // ~$0.0002 per image (GPU cost estimate)
        },
    ],
    "zimage": [
        {
            date: PRICING_START_DATE,
            completionImageTokens: 0.0002, // ~$0.0002 per image (GPU cost estimate)
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
    "sana": {
        aliases: [],
        modelId: "sana",
        free: true,
        provider: "io.net",
        tier: "seed",
    },
    "zimage": {
        aliases: ["flux", "z-image"],
        modelId: "zimage",
        free: true,
        provider: "io.net",
        tier: "seed",
    },
    "kontext": {
        aliases: [],
        modelId: "kontext",
        provider: "azure",
        tier: "nectar",
    },
    "turbo": {
        aliases: [],
        modelId: "turbo",
        provider: "scaleway",
        tier: "seed",
    },
    nanobanana: {
        aliases: [],
        modelId: "nanobanana",
        provider: "vertex-ai",
        tier: "nectar",
    },
    seedream: {
        aliases: [],
        modelId: "seedream",
        provider: "bytedance-ark",
        tier: "nectar",
    },
    // Disabled - available via enter.pollinations.ai
    // "gptimage": {
    //     aliases: ["gpt-image", "gpt-image-1-mini"],
    //     modelId: "gptimage",
    //     provider: "azure-openai",
    //     tier: "seed",
    // },
} as const satisfies ServiceRegistry<typeof IMAGE_COSTS>;


