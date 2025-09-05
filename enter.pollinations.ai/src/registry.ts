import { omit } from "./util.ts";

const UNITS = {
    DPMT: {
        description: "dollars per million tokens",
        convert: (tokens: number, rate: number): number => {
            return (tokens / 1_000_000) * rate;
        },
    },
} as const;

type Unit = keyof typeof UNITS;

const USAGE_TYPES = {
    promptTextTokens: {
        description: "number of text tokens in the input prompt",
    },
    promptCachedTokens: {
        description: "number of cached tokens in the input prompt",
    },
    promptAudioTokes: {
        description: "number of audio tokens in the input prompt",
    },
    promptImageTokens: {
        description: "number of image tokens in the input prompt",
    },
    completionTextTokens: {
        description: "number of text tokens in the generated completion",
    },
    completionAudioTokens: {
        description: "number of audio tokens in the generated completion",
    },
    completionImageTokens: {
        description: "number of image tokens in the generated completion",
    },
} as const;

type UsageType = keyof typeof USAGE_TYPES;

type TokenUsage = {
    unit: "TOKENS";
} & { [K in UsageType]?: number };

type DollarConvertedUsage = {
    unit: "USD";
} & { [K in UsageType]?: number };

type UsageCost = DollarConvertedUsage & {
    totalCost: number;
};

type UsagePrice = DollarConvertedUsage & {
    totalPrice: number;
};

type UsageConversionRate = {
    unit: Unit;
    rate: number;
};

type UsageConversionDefinition = {
    date: number;
} & { [K in UsageType]?: UsageConversionRate };

type PriceDefinition = UsageConversionDefinition;
type CostDefinition = UsageConversionDefinition;

type ProviderDefinition = {
    displayName: string;
    cost: CostDefinition[];
};

type ProviderRegistry = {
    [Key in string]: ProviderDefinition;
};

type ServiceDefinition<T extends ProviderRegistry> = {
    displayName: string;
    aliases: string[];
    providers: (keyof T)[];
    price: PriceDefinition[];
};

type ServiceRegistry<T extends ProviderRegistry> = {
    [Key in string]: ServiceDefinition<T>;
};

/** Sorts the cost and price definitions by date, in descending order */
function sortDefinitions<T extends UsageConversionDefinition>(
    definitions: T[],
): T[] {
    return definitions.sort((a, b) => b.date - a.date);
}

const PROVIDERS = {
    "openai:gpt-4.1-mini-2025-04-14": {
        displayName: "OpenAI GPT-4.1 Nano",
        cost: [
            {
                date: new Date("2024-08-01 00:00:00").getTime(),
                promptTextTokens: {
                    unit: "DPMT",
                    rate: 0.1,
                },
                promptCachedTokens: {
                    unit: "DPMT",
                    rate: 0.03,
                },
                completionTextTokens: {
                    unit: "DPMT",
                    rate: 0.39,
                },
            },
        ],
    },
} as const satisfies ProviderRegistry;

const SERVICES = {
    "openai": {
        displayName: "OpenAI GPT-4.1 Nano",
        aliases: ["gpt-4.1-nano"],
        providers: ["openai:gpt-4.1-mini-2025-04-14"],
        price: [
            {
                date: new Date("2024-08-01 00:00:00").getTime(),
                promptTextTokens: {
                    unit: "DPMT",
                    rate: 0.0,
                },
                promptCachedTokens: {
                    unit: "DPMT",
                    rate: 0.0,
                },
                completionTextTokens: {
                    unit: "DPMT",
                    rate: 0.0,
                },
            },
        ],
    },
} as const satisfies ServiceRegistry<typeof PROVIDERS>;

function getActiveCostDefinition<TP extends ProviderRegistry>(
    providerRegistry: TP,
    provider: keyof TP,
    date: Date = new Date(),
): CostDefinition | null {
    const providerDefinition = providerRegistry[provider];
    if (!providerDefinition) return null;
    for (const definition of providerDefinition.cost) {
        if (definition.date < date.getTime()) return definition;
    }
    return null;
}

function getActivePriceDefinition<
    TP extends ProviderRegistry,
    TS extends ServiceRegistry<TP>,
>(
    serviceRegistry: TS,
    service: keyof TS,
    date: Date = new Date(),
): PriceDefinition | null {
    const serviceDefinition = serviceRegistry[service];
    if (!serviceDefinition) return null;
    for (const definition of serviceDefinition.price) {
        if (definition.date < date.getTime()) return definition;
    }
    return null;
}

function convertUsage(
    usage: TokenUsage,
    conversionDefinition: UsageConversionDefinition,
): DollarConvertedUsage {
    const amounts = omit(usage, "unit");
    const convertedUsage = Object.fromEntries(
        Object.entries(amounts).map(([usageType, amount]) => {
            const conversionRate = conversionDefinition[usageType as UsageType];
            if (!conversionRate) {
                throw new Error(
                    `Failed to get conversion rate for usage type: ${usageType}`,
                );
            }
            const unit = UNITS[conversionRate.unit];
            if (!unit) {
                throw new Error(
                    `Failed to get conversion unit: ${conversionRate.unit}`,
                );
            }
            const rate = conversionRate.rate;
            const usageTypeCost = unit.convert(amount, rate);
            return [usageType, usageTypeCost];
        }),
    );
    return {
        unit: "USD",
        ...convertedUsage,
    };
}

function calculateCost<TP extends ProviderRegistry>(
    providerRegistry: TP,
    provider: keyof TP,
    usage: TokenUsage,
): UsageCost {
    const currentCost = getActiveCostDefinition<TP>(providerRegistry, provider);
    if (!currentCost)
        throw new Error(
            `Failed to get current cost for provider: ${provider.toString()}`,
        );
    const usageCost = convertUsage(usage, currentCost);
    const totalCost = Object.values(omit(usageCost, "unit")).reduce(
        (total, cost) => total + cost,
    );
    return {
        ...usageCost,
        totalCost,
    };
}

function calculatePrice<
    TP extends ProviderRegistry,
    TS extends ServiceRegistry<TP>,
>(serviceRegistry: TS, service: keyof TS, usage: TokenUsage): UsagePrice {
    const currentPrice = getActivePriceDefinition<TP, TS>(
        serviceRegistry,
        service,
    );
    if (!currentPrice)
        throw new Error(
            `Failed to get current price for service: ${service.toString()}`,
        );
    const usagePrice = convertUsage(usage, currentPrice);
    const totalPrice = Object.values(omit(usagePrice, "unit")).reduce(
        (total, price) => total + price,
    );
    return {
        ...usagePrice,
        totalPrice,
    };
}

function isFreeService<
    TP extends ProviderRegistry,
    TS extends ServiceRegistry<TP>,
>(serviceRegistry: TS, service: keyof TS): boolean {
    const servicPriceDefinition = getActivePriceDefinition<TP, TS>(
        serviceRegistry,
        service,
    );
    if (!servicPriceDefinition)
        throw new Error(
            `Failed to get current price for servce: ${service.toString()}`,
        );
    return Object.values(omit(servicPriceDefinition, "date")).every(
        (definition) => definition.rate === 0,
    );
}

export function createRegistry<
    TP extends ProviderRegistry,
    TS extends ServiceRegistry<TP>,
>(providers: TP, services: TS) {
    const providerRegistry = Object.fromEntries(
        Object.entries(providers).map(([name, provider]) => [
            name,
            {
                ...provider,
                cost: sortDefinitions(provider.cost),
            },
        ]),
    ) as TP;

    const serviceRegistry = Object.fromEntries(
        Object.entries(services).map(([name, service]) => [
            name,
            {
                ...service,
                price: sortDefinitions(service.price),
            },
        ]),
    ) as TS;

    return {
        isFreeService: (service: keyof typeof services) =>
            isFreeService<TP, TS>(serviceRegistry, service),
        getActiveCostDefinition: (provider: keyof typeof providers) =>
            getActiveCostDefinition<TP>(providerRegistry, provider),
        getActivePriceDefinition: (service: keyof typeof services) =>
            getActivePriceDefinition<TP, TS>(serviceRegistry, service),
        calculateCost: (provider: keyof typeof providers, usage: TokenUsage) =>
            calculateCost<TP>(providerRegistry, provider, usage),
        calculatePrice: (service: keyof typeof services, usage: TokenUsage) =>
            calculatePrice<TP, TS>(serviceRegistry, service, usage),
    };
}

export const REGISTRY = createRegistry(PROVIDERS, SERVICES);
export type ServiceId = keyof typeof SERVICES;
export type ProviderId = keyof typeof PROVIDERS;
