import type {
    ModelProviderRegistry,
    ServiceRegistry,
    UsageConversionDefinition,
} from "@/registry/registry";

export const IMAGE_MODELS = {
    "flux": {
        displayName: "Flux",
        cost: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                completionImageTokens: {
                    unit: "DPMT",
                    rate: 1,
                },
            },
        ],
    },
    "kontext": {
        displayName: "Flux Kontext",
        cost: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                completionImageTokens: {
                    unit: "DPMT",
                    rate: 1,
                },
            },
        ],
    },
    "turbo": {
        displayName: "Turbo",
        cost: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                completionImageTokens: {
                    unit: "DPMT",
                    rate: 1,
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
                    unit: "DPMT",
                    rate: 0.0,
                },
            },
        ],
    },
    "kontext": {
        displayName: "Flux Kontext",
        aliases: [],
        modelProviders: ["kontext"],
        price: costAsPrice("kontext"),
    },
    "turbo": {
        displayName: "Turbo",
        aliases: [],
        modelProviders: ["turbo"],
        price: costAsPrice("turbo"),
    },
} as const satisfies ServiceRegistry<typeof IMAGE_MODELS>;

function costAsPrice(
    modelProvider: keyof typeof IMAGE_MODELS,
): UsageConversionDefinition[] {
    return IMAGE_MODELS[modelProvider].cost;
}
