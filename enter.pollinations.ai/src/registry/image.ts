import type {
    ModelProviderRegistry,
    ServiceRegistry,
    UsageConversionDefinition,
} from "@/registry/registry";
import { ZERO_PRICE, PRICING_START_DATE, fromDPMT } from "@/registry/price-helpers";

export const IMAGE_MODELS = {
    "flux": {
        displayName: "Flux",
        costType: "fixed_operational_cost",
        cost: [ZERO_PRICE],
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
                date: PRICING_START_DATE,
                completionImageTokens: fromDPMT(30),
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
                date: PRICING_START_DATE,
                completionImageTokens: 0.015,
            },
        ],
    },
    "turbo": {
        displayName: "Turbo",
        aliases: [],
        modelProviders: ["turbo"],
        price: [
            {
                date: PRICING_START_DATE,
                completionImageTokens: 0.015,
            },
        ],
    },
    "nanobanana": {
        displayName: "Nanobanana",
        aliases: [],
        modelProviders: ["nanobanana"],
        price: IMAGE_MODELS["nanobanana"].cost,
    },
    "seedream": {
        displayName: "Seedream",
        aliases: [],
        modelProviders: ["seedream"],
        price: [
            {
                date: PRICING_START_DATE,
                completionImageTokens: 0.015,
            },
        ],
    },
} as const satisfies ServiceRegistry<typeof IMAGE_MODELS>;


