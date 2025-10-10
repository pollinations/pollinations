import type {
    ModelRegistry,
    ServiceRegistry,
    UsageConversionDefinition,
} from "./registry.ts";
import { ZERO_PRICE, PRICING_START_DATE, fromDPMT } from "./price-helpers.ts";

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
} as const satisfies ModelRegistry;

export const IMAGE_SERVICES = {
    "flux": {
        aliases: [],
        modelIds: ["flux"],
        price: [ZERO_PRICE],
    },
    "kontext": {
        aliases: [],
        modelIds: ["kontext"],
        price: IMAGE_COSTS["kontext"],
    },
    "turbo": {
        aliases: [],
        modelIds: ["turbo"],
        price: IMAGE_COSTS["turbo"],
    },
    "nanobanana": {
        aliases: [],
        modelIds: ["nanobanana"],
        price: IMAGE_COSTS["nanobanana"],
    },
    "seedream": {
        aliases: [],
        modelIds: ["seedream"],
        price: IMAGE_COSTS["seedream"],
    },
} as const satisfies ServiceRegistry<typeof IMAGE_COSTS>;


