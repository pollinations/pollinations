import type {
    ModelRegistry,
    ServiceRegistry,
    UsageConversionDefinition,
} from "./registry";
import type { UserTier } from "./types";
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
    "gptimage": [
        // Estimated
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
    "gptimage": {
        aliases: ["gpt-image", "gpt-image-1-mini"],
        modelId: "gptimage",
        price: IMAGE_COSTS["gptimage"],
        provider: "azure-openai",
        tier: "seed",
    },
} as const satisfies ServiceRegistry<typeof IMAGE_COSTS>;


