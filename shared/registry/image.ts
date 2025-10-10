import type {
    ModelRegistry,
    ServiceRegistry,
    UsageConversionDefinition,
} from "./registry.ts";
import { ZERO_PRICE, PRICING_START_DATE, fromDPMT } from "./price-helpers.ts";

export const IMAGE_MODELS = {
    "flux": [
        // TODO: Verify operational cost estimate
        // Currently estimated at 0.3 cents per image ($0.003)
        {
            date: PRICING_START_DATE,
            completionImageTokens: fromDPMT(3000), // $3000 per 1M tokens = $0.003 per token/image
        },
    ],
    "kontext": [ZERO_PRICE],
    "turbo": [ZERO_PRICE],
    "nanobanana": [
        {
            date: PRICING_START_DATE,
            completionImageTokens: fromDPMT(30),
        },
    ],
    "seedream": [ZERO_PRICE],
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
        price: [
            {
                date: PRICING_START_DATE,
                completionImageTokens: 0.015,
            },
        ],
    },
    "turbo": {
        aliases: [],
        modelIds: ["turbo"],
        price: [
            {
                date: PRICING_START_DATE,
                completionImageTokens: 0.015,
            },
        ],
    },
    "nanobanana": {
        aliases: [],
        modelIds: ["nanobanana"],
        price: IMAGE_MODELS["nanobanana"],
    },
    "seedream": {
        aliases: [],
        modelIds: ["seedream"],
        price: [
            {
                date: PRICING_START_DATE,
                completionImageTokens: 0.015,
            },
        ],
    },
} as const satisfies ServiceRegistry<typeof IMAGE_MODELS>;


