import type {
    ModelProviderRegistry,
    ServiceRegistry,
    UsageConversionDefinition,
} from "@/registry/registry";
import { ZERO_PRICE, fromDPMT, costAsPrice } from "@/registry/price-helpers";

export const IMAGE_MODELS = {
    "flux": {
        displayName: "Flux",
        costType: "fixed_operational_cost",
        cost: costAsPrice(IMAGE_MODELS, "flux"),
    },
    "kontext": {
        displayName: "Flux Kontext",
        costType: "fixed_operational_cost",
        cost: [ZERO_PRICE],
    },
    "turbo": {
        displayName: "Turbo",
        costType: "fixed_operational_cost",
        cost: [ZERO_PRICE],
    },
    "nanobanana": {
        displayName: "Nanobanana",
        costType: "per_generation_cost",
        cost: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                completionImageTokens: fromDPMT(30), // $30 per 1M tokens = $0.00003 per token
            },
        ],
    },
    "seedream": {
        displayName: "Seedream",
        costType: "fixed_operational_cost",
        cost: [ZERO_PRICE],
    },
} as const satisfies ModelProviderRegistry;

export const IMAGE_SERVICES = {
    "flux": {
        displayName: "Flux",
        aliases: [],
        modelProviders: ["flux"],
        price: [ZERO_PRICE],
    },
    "kontext": {
        displayName: "Flux Kontext",
        aliases: [],
        modelProviders: ["kontext"],
        price: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                completionImageTokens: 0.015, // $0.015 per image (1 token = 1 image)
            },
        ],
    },
    "turbo": {
        displayName: "Turbo",
        aliases: [],
        modelProviders: ["turbo"],
        price: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                completionImageTokens: 0.015, // $0.015 per image (1 token = 1 image)
            },
        ],
    },
    "nanobanana": {
        displayName: "Nanobanana",
        aliases: [],
        modelProviders: ["nanobanana"],
        price: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                completionImageTokens: fromDPMT(30), // $30 per 1M tokens = $0.00003 per token
            },
        ],
    },
    "seedream": {
        displayName: "Seedream",
        aliases: [],
        modelProviders: ["seedream"],
        price: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                completionImageTokens: 0.015, // $0.015 per image (1 token = 1 image)
            },
        ],
    },
} as const satisfies ServiceRegistry<typeof IMAGE_MODELS>;


