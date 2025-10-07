import { omit, safeRound } from "../utils.ts";
import { TEXT_MODELS, TEXT_SERVICES } from "./text.ts";
import { IMAGE_MODELS, IMAGE_SERVICES } from "./image.ts";
import { EventType } from "./types.ts";

const PRECISION = 8;

const COST_TYPES = ["fixed_operational_cost", "per_generation_cost"] as const;
export type CostType = (typeof COST_TYPES)[number];

export type UsageType =
    | "promptTextTokens"
    | "promptCachedTokens"
    | "promptAudioTokens"
    | "promptImageTokens"
    | "completionTextTokens"
    | "completionReasoningTokens"
    | "completionAudioTokens"
    | "completionImageTokens";

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

export type UsageConversionDefinition = {
    date: number;
} & { [K in UsageType]?: number };

export type CostDefinition = UsageConversionDefinition;
export type PriceDefinition = UsageConversionDefinition;

export type ModelProviderDefinition = {
    displayName: string;
    costType: CostType;
    cost: CostDefinition[];
};

export type ModelProviderRegistry = Record<string, ModelProviderDefinition>;

export type ServiceDefinition<T extends ModelProviderRegistry> = {
    displayName: string;
    aliases: string[];
    modelProviders: (keyof T)[];
    price: PriceDefinition[];
};

export type ServiceRegistry<T extends ModelProviderRegistry> = Record<
    string,
    ServiceDefinition<T>
>;

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
            if (conversionRate === undefined) {
                throw new Error(
                    `Failed to get conversion rate for usage type: ${usageType}`,
                );
            }
            const usageTypeCost = safeRound(amount * conversionRate, PRECISION);
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
        (rate) => rate === 0,
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
                            // Units are always USD now, no need to check
                            return [
                                usageType,
                                usagePrice - usageCost,
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

    // Build alias lookup map: alias -> serviceId
    const aliasMap = Object.fromEntries(
        Object.entries(services).flatMap(([serviceId, service]) =>
            service.aliases.map((alias) => [alias, serviceId]),
        ),
    );

    return {
        resolveServiceId: (
            serviceId: string | null | undefined,
            eventType: EventType,
        ): ServiceId<TP, TS> => {
            if (!serviceId) {
                return eventType === "generate.text" ? "openai" : "flux";
            }
            // Check if it's a direct service ID or an alias
            const resolved = serviceRegistry[serviceId] ? serviceId : aliasMap[serviceId];
            if (resolved) {
                return resolved as ServiceId<TP, TS>;
            }
            // Fallback to default
            return eventType === "generate.text" ? "openai" : "flux";
        },
        isValidModelProvider: (
            providerId: ProviderId<TP>,
        ): providerId is ProviderId<TP> => {
            return !!providerRegistry[providerId];
        },
        isValidService: (
            serviceId: ServiceId<TP, TS> | string,
        ): serviceId is ServiceId<TP, TS> => {
            return !!serviceRegistry[serviceId];
        },
        isFreeService: (serviceId: ServiceId<TP, TS>) => {
            return isFreeService<TP, TS>(serviceRegistry, serviceId);
        },
        getServices: (): ServiceId<TP, TS>[] => {
            return Object.keys(serviceRegistry);
        },
        getServiceDefinition: (
            serviceId: ServiceId<TP, TS>,
        ): ServiceDefinition<TP> => {
            return serviceRegistry[serviceId];
        },
        getModelProviders: (): ProviderId<TP>[] => {
            return Object.keys(providerRegistry);
        },
        getModelProviderDefinition: (
            providerId: ProviderId<TP>,
        ): ModelProviderDefinition => {
            return providerRegistry[providerId];
        },
        getCostType: (providerId: ProviderId<TP>): CostType => {
            return providerRegistry[providerId]?.costType;
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
