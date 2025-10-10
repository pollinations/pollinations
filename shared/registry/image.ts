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
    "nanobanana": [
        {
            date: PRICING_START_DATE,
            completionImageTokens: fromDPMT(30),
        },
    ],
    "seedream": [
        // Estimated
        {
            date: PRICING_START_DATE,
            completionImageTokens: fromDPMT(5000),
        },
    ],
    "gptimage": [
        // Azure GPT Image model
        {
            date: PRICING_START_DATE,
            completionImageTokens: fromDPMT(2500),
        },
    ],
} as const satisfies ModelRegistry;

export const IMAGE_SERVICES = {
    "flux": {
        aliases: [],
        modelId: "flux",
        price: [ZERO_PRICE],
    },
    "kontext": {
        aliases: [],
        modelId: "kontext",
        price: IMAGE_COSTS["kontext"],
    },
    "turbo": {
        aliases: [],
        modelId: "turbo",
        price: IMAGE_COSTS["turbo"],
    },
    "nanobanana": {
        aliases: [],
        modelId: "nanobanana",
        price: IMAGE_COSTS["nanobanana"],
    },
    "seedream": {
        aliases: [],
        modelId: "seedream",
        price: IMAGE_COSTS["seedream"],
    },
    "gptimage": {
        aliases: ["gpt-image", "gpt-image-1-mini"],
        modelId: "gptimage",
        price: IMAGE_COSTS["gptimage"],
    },
} as const satisfies ServiceRegistry<typeof IMAGE_COSTS>;


