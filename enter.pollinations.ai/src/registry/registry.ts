import { omit, safeRound } from "../util.ts";
import { TEXT_MODELS, TEXT_SERVICES } from "./text.ts";
import { IMAGE_MODELS, IMAGE_SERVICES } from "./image.ts";
import { EventType } from "@/db/schema/event.ts";

const PRECISION = 8;

const UNITS = {
    DPMT: {
        description: "dollars per million tokens",
        convert: (tokens: number, rate: number): number => {
            return safeRound((tokens / 1_000_000) * rate, PRECISION);
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
    promptAudioTokens: {
        description: "number of audio tokens in the input prompt",
    },
    promptImageTokens: {
        description: "number of image tokens in the input prompt",
    },
    completionTextTokens: {
        description: "number of text tokens in the generated completion",
    },
    completionReasoningTokens: {
        description: "number of reasoning tokens in the generated completion",
    },
    completionAudioTokens: {
        description: "number of audio tokens in the generated completion",
    },
    completionImageTokens: {
        description: "number of image tokens in the generated completion",
    },
} as const;

export type UsageType = keyof typeof USAGE_TYPES;

export type TokenUsage = {
    unit: "TOKENS";
} & { [K in UsageType]?: number };

export type DollarConvertedUsage = {
    unit: "USD";
} & { [K in UsageType]?: number };

export type UsageCost = DollarConvertedUsage & {
    totalCost: number;
};

export type UsagePrice = DollarConvertedUsage & {
    totalPrice: number;
};

export type UsageConversionRate = {
    unit: Unit;
    rate: number;
};

export type UsageConversionDefinition = {
    date: number;
} & { [K in UsageType]?: UsageConversionRate };

export type PriceDefinition = UsageConversionDefinition;
export type CostDefinition = UsageConversionDefinition;

export type ModelProviderDefinition = {
    displayName: string;
    cost: CostDefinition[];
};

export type ModelProviderRegistry = {
    [Key in string]: ModelProviderDefinition;
};

export type ServiceDefinition<T extends ModelProviderRegistry> = {
    displayName: string;
    aliases: string[];
    modelProviders: (keyof T)[];
    price: PriceDefinition[];
};

export type ServiceRegistry<T extends ModelProviderRegistry> = {
    [Key in string]: ServiceDefinition<T>;
};

export type ServiceMargins = {
    [Key in string]: {
        [Key in UsageType]?: number;
    };
};

const MODELS = {
    ...TEXT_MODELS,
    ...IMAGE_MODELS,
} as const satisfies ModelProviderRegistry;

const SERVICES = {
    ...TEXT_SERVICES,
    ...IMAGE_SERVICES,
} as const satisfies ServiceRegistry<typeof MODELS>;

export type ProviderId<TP extends ModelProviderRegistry = typeof MODELS> =
    keyof TP;

export type ServiceId<
    TP extends ModelProviderRegistry = typeof MODELS,
    TS extends ServiceRegistry<TP> = typeof SERVICES,
> = keyof TS;

/** Sorts the cost and price definitions by date, in descending order */
function sortDefinitions<T extends UsageConversionDefinition>(
    definitions: T[],
): T[] {
    return definitions.sort((a, b) => b.date - a.date);
}

function getActiveCostDefinition<TP extends ModelProviderRegistry>(
    providerRegistry: TP,
    providerId: keyof TP,
    date: Date = new Date(),
): CostDefinition | null {
    const providerDefinition = providerRegistry[providerId];
    if (!providerDefinition) return null;
    for (const definition of providerDefinition.cost) {
        if (definition.date < date.getTime()) return definition;
    }
    return null;
}

function getActivePriceDefinition<
    TP extends ModelProviderRegistry,
    TS extends ServiceRegistry<TP>,
>(
    serviceRegistry: TS,
    serviceId: keyof TS,
    date: Date = new Date(),
): PriceDefinition | null {
    const serviceDefinition = serviceRegistry[serviceId];
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
            if (amount === 0) return [usageType, 0];
            const usageTypeWithFallback =
                usageType === "completionReasoningTokens"
                    ? "completionTextTokens"
                    : usageType;
            const conversionRate =
                conversionDefinition[usageTypeWithFallback as UsageType];
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

function calculateCost<TP extends ModelProviderRegistry>(
    providerRegistry: TP,
    providerId: keyof TP,
    usage: TokenUsage,
): UsageCost {
    const currentCost = getActiveCostDefinition<TP>(
        providerRegistry,
        providerId,
    );
    if (!currentCost)
        throw new Error(
            `Failed to get current cost for provider: ${providerId.toString()}`,
        );
    const usageCost = convertUsage(usage, currentCost);
    const totalCost = safeRound(
        Object.values(omit(usageCost, "unit")).reduce(
            (total, cost) => total + cost,
        ),
        PRECISION,
    );
    return {
        ...usageCost,
        totalCost,
    };
}

function calculatePrice<
    TP extends ModelProviderRegistry,
    TS extends ServiceRegistry<TP>,
>(serviceRegistry: TS, serviceId: keyof TS, usage: TokenUsage): UsagePrice {
    const currentPrice = getActivePriceDefinition<TP, TS>(
        serviceRegistry,
        serviceId,
    );
    if (!currentPrice)
        throw new Error(
            `Failed to get current price for service: ${serviceId.toString()}`,
        );
    const usagePrice = convertUsage(usage, currentPrice);
    const totalPrice = safeRound(
        Object.values(omit(usagePrice, "unit")).reduce(
            (total, price) => total + price,
        ),
        PRECISION,
    );
    return {
        ...usagePrice,
        totalPrice,
    };
}

function isFreeService<
    TP extends ModelProviderRegistry,
    TS extends ServiceRegistry<TP>,
>(serviceRegistry: TS, serviceId: keyof TS): boolean {
    const servicPriceDefinition = getActivePriceDefinition<TP, TS>(
        serviceRegistry,
        serviceId,
    );
    if (!servicPriceDefinition)
        throw new Error(
            `Failed to get current price for servce: ${serviceId.toString()}`,
        );
    return Object.values(omit(servicPriceDefinition, "date")).every(
        (definition) => definition.rate === 0,
    );
}

function calculateMargins<
    TP extends ModelProviderRegistry,
    TS extends ServiceRegistry<TP>,
>(providers: TP, services: TS, serviceId: keyof TS): ServiceMargins {
    const serviceDefinition = services[serviceId];
    const servicePriceDefinition = getActivePriceDefinition<TP, TS>(
        services,
        serviceId,
    );
    if (!servicePriceDefinition)
        throw new Error(
            `Failed to find price definition for service: ${serviceId.toString()}`,
        );
    return Object.fromEntries(
        serviceDefinition.modelProviders.map((provider) => {
            const costDefinition = getActiveCostDefinition(providers, provider);
            if (!costDefinition)
                throw new Error(
                    `Failed to find cost definition for provider: ${provider.toString()}`,
                );
            return [
                provider,
                Object.fromEntries(
                    Object.keys(omit(costDefinition, "date")).map(
                        (usageType) => {
                            const usageCost =
                                costDefinition[usageType as UsageType];
                            const usagePrice =
                                servicePriceDefinition[usageType as UsageType];
                            if (!usageCost || !usagePrice) {
                                throw new Error(
                                    `Failed to find usage cost or price for provider: ${provider.toString()}`,
                                );
                            }
                            if (usageCost.unit !== usagePrice.unit) {
                                throw new Error(
                                    `Usage cost and price units do not match for provider: ${provider.toString()}`,
                                );
                            }
                            return [
                                usageType,
                                usagePrice.rate - usageCost.rate,
                            ];
                        },
                    ),
                ),
            ];
        }),
    );
}

export function createRegistry<
    TP extends ModelProviderRegistry,
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
        withFallbackService: (
            serviceId: string | null,
            eventType: EventType,
        ): ServiceId => {
            if (serviceId && !!serviceRegistry[serviceId]) {
                return serviceId as ServiceId;
            }
            if (eventType === "generate.text") {
                return "openai";
            } else {
                return "flux";
            }
        },
        isValidModelProvider: (
            providerId: ProviderId<TP>,
        ): providerId is ProviderId<TP> => {
            return !!providerRegistry[providerId];
        },
        isValidService: (
            serviceId: ServiceId<TP, TS>,
        ): serviceId is ServiceId<TP, TS> => {
            return !!serviceRegistry[serviceId];
        },
        isFreeService: (serviceId: ServiceId<TP, TS>) => {
            return isFreeService<TP, TS>(serviceRegistry, serviceId);
        },
        getServices: (): ServiceId<TP, TS>[] => {
            return Object.keys(serviceRegistry);
        },
        getService: (serviceId: ServiceId<TP, TS>): ServiceDefinition<TP> => {
            return serviceRegistry[serviceId];
        },
        getModelProviders: (): ProviderId<TP>[] => {
            return Object.keys(providerRegistry);
        },
        getModelProvider: (
            providerId: ProviderId<TP>,
        ): ModelProviderDefinition => {
            return providerRegistry[providerId];
        },
        getActiveCostDefinition: (
            providerId: ProviderId<TP>,
        ): CostDefinition | null => {
            return getActiveCostDefinition<TP>(providerRegistry, providerId);
        },
        getActivePriceDefinition: (
            serviceId: ServiceId<TP, TS>,
        ): PriceDefinition | null => {
            return getActivePriceDefinition<TP, TS>(serviceRegistry, serviceId);
        },
        calculateCost: (
            providerId: ProviderId<TP>,
            usage: TokenUsage,
        ): UsageCost => {
            return calculateCost<TP>(providerRegistry, providerId, usage);
        },
        calculatePrice: (
            serviceId: ServiceId<TP, TS>,
            usage: TokenUsage,
        ): UsagePrice => {
            return calculatePrice<TP, TS>(serviceRegistry, serviceId, usage);
        },
        calculateMargins: (serviceId: ServiceId<TP, TS>): ServiceMargins => {
            return calculateMargins<TP, TS>(
                providerRegistry,
                serviceRegistry,
                serviceId,
            );
        },
    };
}

export const REGISTRY = createRegistry(MODELS, SERVICES);
