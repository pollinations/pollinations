import type {
    ModelRegistry,
    ServiceRegistry,
    UsageConversionDefinition,
} from "./registry";
import { ZERO_PRICE, PRICING_START_DATE, fromDPMT } from "./price-helpers";

export const IMAGE_COSTS = {
    "flux": [
        // Estimated
        {
            date: PRICING_START_DATE,
            completionImageTokens: fromDPMT(3000),
        },
    ],
    "kontext": [
        // Estimated
        {
            date: PRICING_START_DATE,
            completionImageTokens: fromDPMT(4000),
        },
    ],
    "turbo": [
        // Estimated
        {
            date: PRICING_START_DATE,
            completionImageTokens: fromDPMT(2000),
        },
    ],
    // "nanobanana": [
    //     {
    //         date: PRICING_START_DATE,
    //         completionImageTokens: fromDPMT(30000),
    //     },
    // ],
    // "seedream": [
    //     // Estimated
    //     {
    //         date: PRICING_START_DATE,
    //         completionImageTokens: fromDPMT(30000),
    //     },
    // ],
    "gptimage": [
        // Azure GPT Image model
        {
            date: PRICING_START_DATE,
            completionImageTokens: fromDPMT(10000),
        },
    ],
} as const satisfies ModelRegistry;

export const IMAGE_SERVICES = {
    "flux": {
        aliases: [],
        modelId: "flux",
        price: [ZERO_PRICE],
        provider: "pollinations",
    },
    "kontext": {
        aliases: [],
        modelId: "kontext",
        price: IMAGE_COSTS["kontext"],
        provider: "bpaigen",
    },
    "turbo": {
        aliases: [],
        modelId: "turbo",
        price: IMAGE_COSTS["turbo"],
        provider: "pollinations",
    },
    // "nanobanana": {
    //     aliases: [],
    //     modelId: "nanobanana",
    //     // price: IMAGE_COSTS["nanobanana"],
    //     provider: "vertex-ai",
    // },
    // "seedream": {
    //     aliases: [],
    //     modelId: "seedream",
    //     // price: IMAGE_COSTS["seedream"],
    //     provider: "bytedance-ark",
    // },
    "gptimage": {
        aliases: ["gpt-image", "gpt-image-1-mini"],
        modelId: "gptimage",
        price: IMAGE_COSTS["gptimage"],
        provider: "azure-openai",
    },
} as const satisfies ServiceRegistry<typeof IMAGE_COSTS>;


