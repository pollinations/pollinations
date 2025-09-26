import type {
    ModelProviderRegistry,
    ServiceRegistry,
    UsageConversionDefinition,
} from "@/registry/registry";

export const IMAGE_MODELS = {
    "flux": {
        displayName: "Flux",
        costType: "fixed_operational_cost",
        cost: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                completionImageTokens: {
                    unit: "DPT",
                    rate: 0, // fixed weekly cost
                },
            },
        ],
    },
    "kontext": {
        displayName: "Flux Kontext",
        costType: "fixed_operational_cost",
        cost: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                completionImageTokens: {
                    unit: "DPT",
                    rate: 0, // fixed weekly cost
                },
            },
        ],
    },
    "turbo": {
        displayName: "Turbo",
        costType: "fixed_operational_cost",
        cost: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                completionImageTokens: {
                    unit: "DPT",
                    rate: 0, // fixed weekly cost
                },
            },
        ],
    },
    "nanobanana": {
        displayName: "Nanobanana",
        costType: "per_generation_cost",
        cost: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                completionImageTokens: {
                    unit: "DPMT",
                    rate: 30,
                },
            },
        ],
    },
    "seedream": {
        displayName: "Seedream",
        costType: "fixed_operational_cost",
        cost: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                completionImageTokens: {
                    unit: "DPT",
                    rate: 0, // fixed weekly cost
                },
            },
        ],
    },
} as const satisfies ModelProviderRegistry;

export const IMAGE_SERVICES = {
    "flux": {
        displayName: "Flux",
        aliases: [],
        modelProviders: ["flux"],
        price: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                completionImageTokens: {
                    unit: "DPT",
                    rate: 0.0,
                },
            },
        ],
    },
    "kontext": {
        displayName: "Flux Kontext",
        aliases: [],
        modelProviders: ["kontext"],
        price: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                completionImageTokens: {
                    unit: "DPT",
                    rate: 0.015,
                },
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
                completionImageTokens: {
                    unit: "DPT",
                    rate: 0.015,
                },
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
                completionImageTokens: {
                    unit: "DPMT",
                    rate: 30.0,
                },
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
                completionImageTokens: {
                    unit: "DPT",
                    rate: 0.015,
                },
            },
        ],
    },
} as const satisfies ServiceRegistry<typeof IMAGE_MODELS>;

function costAsPrice(
    modelProvider: keyof typeof IMAGE_MODELS,
): UsageConversionDefinition[] {
    return IMAGE_MODELS[modelProvider].cost;
}
