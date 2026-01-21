import { safeRound } from "../utils";
import {
    IMAGE_SERVICES,
    type ImageModelId,
    type ImageServiceId,
} from "./image";
import { TEXT_SERVICES, type TextModelId, type TextServiceId } from "./text";

const PRECISION = 8;

export type UsageType =
    | "promptTextTokens"
    | "promptCachedTokens"
    | "promptAudioTokens"
    | "promptImageTokens"
    | "completionTextTokens"
    | "completionReasoningTokens"
    | "completionAudioTokens"
    | "completionAudioSeconds"
    | "completionImageTokens"
    | "completionVideoSeconds"
    | "completionVideoTokens";

// Usage represents raw usage metrics (tokens, seconds, etc.)
export type Usage = { [K in UsageType]?: number };

// UsageCost is Usage with dollar amounts and a total
export type UsageCost = Usage & {
    totalCost: number;
};

// UsagePrice is Usage with dollar amounts and a total (currently same as cost)
export type UsagePrice = Usage & {
    totalPrice: number;
};

// CostDefinition defines conversion rates from usage to dollars
export type CostDefinition = {
    date: number;
} & { [K in UsageType]?: number };

// PriceDefinition defines conversion rates for pricing (currently same as cost)
export type PriceDefinition = CostDefinition;

export type ModelDefinition = CostDefinition[];

// Pre-build MODEL_REGISTRY (modelId -> sorted cost definitions)
// Uses lowercase keys for case-insensitive lookup (Azure returns lowercase model IDs)
const MODEL_REGISTRY = Object.fromEntries(
    Object.values({ ...TEXT_SERVICES, ...IMAGE_SERVICES }).map((service) => [
        service.modelId.toLowerCase(),
        sortDefinitions([...service.cost]),
    ]),
);

export type ModelId = ImageModelId | TextModelId;
export type ServiceId = ImageServiceId | TextServiceId;

export type ServiceDefinition<TModelId extends string = ModelId> = {
    aliases: string[];
    modelId: TModelId;
    provider: string;
    cost: CostDefinition[];
    // User-facing metadata
    description?: string;
    inputModalities?: string[];
    outputModalities?: string[];
    tools?: boolean;
    reasoning?: boolean;
    search?: boolean;
    codeExecution?: boolean;
    contextWindow?: number;
    voices?: string[];
    isSpecialized?: boolean;
    persona?: boolean;
};

/** Sorts the cost and price definitions by date, in descending order */
function sortDefinitions<T extends CostDefinition>(definitions: T[]): T[] {
    return definitions.sort((a, b) => b.date - a.date);
}

// Helper: Convert usage to dollar amounts
function convertUsage(
    usage: Usage,
    conversionDefinition: CostDefinition,
): Usage {
    const convertedUsage = Object.fromEntries(
        Object.entries(usage).map(([usageType, amount]) => {
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
    return convertedUsage as Usage;
}

// Generate SERVICE_REGISTRY with computed prices from costs
type ServiceRegistryEntry = ServiceDefinition & {
    price: PriceDefinition[];
};

const SERVICE_REGISTRY = Object.fromEntries(
    Object.entries({ ...TEXT_SERVICES, ...IMAGE_SERVICES }).map(
        ([name, service]) => [
            name,
            {
                ...service,
                price: sortDefinitions([...service.cost]),
            } as ServiceRegistryEntry,
        ],
    ),
) as Record<string, ServiceRegistryEntry>;

/**
 * Resolve a service ID from a name or alias
 * @param serviceId - Service name or alias
 * @returns Resolved service ID
 * @throws Error if service ID is not found
 */
export function resolveServiceId(serviceId: string): ServiceId {
    // Check if it's a direct service ID
    if (SERVICE_REGISTRY[serviceId]) {
        return serviceId as ServiceId;
    }
    // Search for alias in services
    for (const [sid, service] of Object.entries(SERVICE_REGISTRY)) {
        if (service.aliases.includes(serviceId)) {
            return sid as ServiceId;
        }
    }
    throw new Error(
        `Invalid service or alias: "${serviceId}". Must be a valid service name or alias.`,
    );
}

/**
 * Check if a model ID exists in the registry
 */
export function isValidModel(modelId: ModelId): modelId is ModelId {
    return !!MODEL_REGISTRY[modelId.toLowerCase()];
}

/**
 * Check if a service ID exists in the registry
 */
export function isValidService(
    serviceId: ServiceId | string,
): serviceId is ServiceId {
    return !!SERVICE_REGISTRY[serviceId];
}

/**
 * Get all service IDs
 */
export function getServices(): ServiceId[] {
    return Object.keys(SERVICE_REGISTRY) as ServiceId[];
}

/**
 * Get text service IDs
 */
export function getTextServices(): ServiceId[] {
    return Object.keys(TEXT_SERVICES) as ServiceId[];
}

/**
 * Get image service IDs
 */
export function getImageServices(): ServiceId[] {
    return Object.keys(IMAGE_SERVICES) as ServiceId[];
}

/**
 * Get service definition by ID
 */
export function getServiceDefinition(
    serviceId: ServiceId,
): ServiceRegistryEntry {
    return SERVICE_REGISTRY[serviceId];
}

/**
 * Get aliases for a service
 */
export function getServiceAliases(serviceId: ServiceId): readonly string[] {
    const service = SERVICE_REGISTRY[serviceId];
    return service?.aliases || [];
}

/**
 * Get model definition by ID
 */
export function getModelDefinition(
    modelId: string,
): ModelDefinition | undefined {
    return MODEL_REGISTRY[modelId.toLowerCase() as ModelId];
}

/**
 * Get active cost definition for a model
 */
export function getActiveCostDefinition(
    modelId: ModelId,
    date: Date = new Date(),
): CostDefinition | null {
    const modelDefinition = MODEL_REGISTRY[modelId.toLowerCase()];
    if (!modelDefinition) return null;
    for (const definition of modelDefinition) {
        if (definition.date < date.getTime()) return definition;
    }
    return null;
}

/**
 * Get active price definition for a service
 */
export function getActivePriceDefinition(
    serviceId: ServiceId,
    date: Date = new Date(),
): PriceDefinition | null {
    const serviceDefinition = SERVICE_REGISTRY[serviceId];
    if (!serviceDefinition) return null;
    for (const definition of serviceDefinition.price) {
        if (definition.date < date.getTime()) return definition;
    }
    return null;
}

/**
 * Calculate cost for a model based on usage
 */
export function calculateCost(modelId: ModelId, usage: Usage): UsageCost {
    const costDefinition = getActiveCostDefinition(modelId);
    if (!costDefinition)
        throw new Error(
            `Failed to get current cost for model: ${modelId.toString()}`,
        );
    const usageCost = convertUsage(usage, costDefinition);
    const totalCost = safeRound(
        Object.values(usageCost).reduce((total, cost) => total + cost),
        PRECISION,
    );
    return {
        ...usageCost,
        totalCost,
    };
}

/**
 * Calculate price for a service based on usage
 */
export function calculatePrice(serviceId: ServiceId, usage: Usage): UsagePrice {
    const priceDefinition = getActivePriceDefinition(serviceId);
    if (!priceDefinition)
        throw new Error(
            `Failed to get current price for service: ${serviceId.toString()}`,
        );
    const usagePrice = convertUsage(usage, priceDefinition);
    const totalPrice = safeRound(
        Object.values(usagePrice).reduce((total, price) => total + price),
        PRECISION,
    );
    return {
        ...usagePrice,
        totalPrice,
    };
}

// ModelInfo, getModelInfo, getTextModelsInfo, getImageModelsInfo are in model-info.ts
