import { omit, safeRound } from "../utils";
import { TEXT_COSTS, TEXT_SERVICES, DEFAULT_TEXT_MODEL } from "./text";
import { IMAGE_COSTS, IMAGE_SERVICES, DEFAULT_IMAGE_MODEL } from "./image";
import type { EventType } from "./types";

const PRECISION = 8;

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
    provider?: string; // Provider identifier (e.g., "azure-openai", "aws-bedrock")
} & { [K in UsageType]?: number };

export type CostDefinition = UsageConversionDefinition;
export type PriceDefinition = UsageConversionDefinition;

/** User-facing service metadata */
export interface ServiceMetadata {
    description?: string;
    input_modalities?: string[];
    output_modalities?: string[];
    tools?: boolean;
    reasoning?: boolean;
    vision?: boolean;
    audio?: boolean;
    context_window?: number;
    voices?: string[];
    community?: boolean;
    hidden?: boolean;
}

export type ModelDefinition = CostDefinition[];

export type ModelRegistry = Record<string, ModelDefinition>;

export type ServiceDefinition<T extends ModelRegistry> = {
    aliases: string[];
    modelId: keyof T;
} & Partial<ServiceMetadata>; // Add user-facing metadata

export type ServiceRegistry<T extends ModelRegistry> = Record<
    string,
    ServiceDefinition<T>
>;

export type ServiceMargins = {
    [Key in string]: {
        [Key in UsageType]?: number;
    };
};

const MODELS = {
    ...TEXT_COSTS,
    ...IMAGE_COSTS,
} as const satisfies ModelRegistry;

const SERVICES = {
    ...TEXT_SERVICES,
    ...IMAGE_SERVICES,
} as const satisfies ServiceRegistry<typeof MODELS>;

export type ModelId<TP extends ModelRegistry = typeof MODELS> = keyof TP;

export type ServiceId<
    TP extends ModelRegistry = typeof MODELS,
    TS extends ServiceRegistry<TP> = typeof SERVICES,
> = keyof TS;

/** Sorts the cost and price definitions by date, in descending order */
function sortDefinitions<T extends UsageConversionDefinition>(
    definitions: T[],
): T[] {
    return definitions.sort((a, b) => b.date - a.date);
}

// Helper: Convert token usage to dollar amounts
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

// Pre-process registries: sort definitions by date
export const MODEL_REGISTRY = Object.fromEntries(
    Object.entries(MODELS).map(([name, model]) => [
        name,
        sortDefinitions(model as UsageConversionDefinition[]),
    ]),
);

// Internal type for SERVICE_REGISTRY entries (includes computed price field)
type ServiceRegistryEntry<T extends ModelRegistry> = ServiceDefinition<T> & {
    price: PriceDefinition[];
};

// Generate SERVICE_REGISTRY with computed prices from costs
export const SERVICE_REGISTRY = Object.fromEntries(
    Object.entries(SERVICES).map(([name, service]) => {
        const typedService = service as ServiceDefinition<typeof MODELS>;
        const modelCost = MODELS[typedService.modelId as keyof typeof MODELS];
        if (!modelCost) {
            throw new Error(
                `Model cost not found for service "${name}" with modelId "${String(typedService.modelId)}"`,
            );
        }

        // Price = cost (1.0x multiplier)
        const price = modelCost.map((costDef) => ({ ...costDef }));

        return [
            name,
            {
                ...service,
                price: sortDefinitions(price),
            } as ServiceRegistryEntry<typeof MODELS>,
        ];
    }),
) as Record<string, ServiceRegistryEntry<typeof MODELS>>;

// Build alias lookup map: alias -> serviceId
export const ALIAS_MAP = Object.fromEntries(
    Object.entries(SERVICES).flatMap(([serviceId, service]) =>
        service.aliases.map((alias) => [alias, serviceId]),
    ),
) as Record<string, ServiceId>;

/**
 * Resolve a service ID from a name or alias
 * @param serviceId - Service name, alias, or null/undefined for default
 * @param eventType - Event type to determine default service
 * @returns Resolved service ID
 */
export function resolveServiceId(
    serviceId: string | null | undefined,
    eventType: EventType,
): ServiceId {
    if (!serviceId) {
        return eventType === "generate.text"
            ? DEFAULT_TEXT_MODEL
            : DEFAULT_IMAGE_MODEL;
    }
    // Check if it's a direct service ID or an alias
    const resolved = SERVICE_REGISTRY[serviceId]
        ? serviceId
        : ALIAS_MAP[serviceId];
    if (resolved) {
        return resolved as ServiceId;
    }
    // Throw error for invalid service/alias
    throw new Error(
        `Invalid service or alias: "${serviceId}". Must be a valid service name or alias.`,
    );
}

/**
 * Check if a model ID exists in the registry
 */
export function isValidModel(modelId: ModelId): modelId is ModelId {
    return !!MODEL_REGISTRY[modelId];
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
 * Get text service IDs
 */
export function getImageServices(): ServiceId[] {
    return Object.keys(IMAGE_SERVICES) as ServiceId[];
}

/**
 * Get service definition by ID
 */
export function getServiceDefinition(
    serviceId: ServiceId,
): ServiceRegistryEntry<typeof MODELS> {
    return SERVICE_REGISTRY[serviceId];
}

/**
 * Get aliases for a service
 */
export function getServiceAliases(serviceId: ServiceId): string[] {
    const service = SERVICE_REGISTRY[serviceId];
    return service?.aliases || [];
}

/**
 * Get all model IDs
 */
export function getModels(): ModelId[] {
    return Object.keys(MODEL_REGISTRY) as ModelId[];
}

/**
 * Get model definition by ID
 */
export function getModelDefinition(modelId: ModelId): ModelDefinition {
    return MODEL_REGISTRY[modelId];
}

/**
 * Get active cost definition for a model
 */
export function getActiveCostDefinition(
    modelId: ModelId,
    date: Date = new Date(),
): CostDefinition | null {
    const modelDefinition = MODEL_REGISTRY[modelId];
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
 * Calculate cost for a model based on token usage
 */
export function calculateCost(modelId: ModelId, usage: TokenUsage): UsageCost {
    const costDefinition = getActiveCostDefinition(modelId);
    if (!costDefinition)
        throw new Error(
            `Failed to get current cost for model: ${modelId.toString()}`,
        );
    const usageCost = convertUsage(usage, costDefinition);
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

/**
 * Calculate price for a service based on token usage
 */
export function calculatePrice(
    serviceId: ServiceId,
    usage: TokenUsage,
): UsagePrice {
    const priceDefinition = getActivePriceDefinition(serviceId);
    if (!priceDefinition)
        throw new Error(
            `Failed to get current price for service: ${serviceId.toString()}`,
        );
    const usagePrice = convertUsage(usage, priceDefinition);
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

/**
 * Calculate profit margins for a service
 */
export function calculateMargins(serviceId: ServiceId): ServiceMargins {
    const serviceDefinition = SERVICE_REGISTRY[serviceId];
    const priceDefinition = getActivePriceDefinition(serviceId);
    if (!priceDefinition)
        throw new Error(
            `Failed to find price definition for service: ${serviceId.toString()}`,
        );
    const modelId = serviceDefinition.modelId;
    const costDefinition = getActiveCostDefinition(modelId);
    if (!costDefinition)
        throw new Error(
            `Failed to find cost definition for model: ${modelId.toString()}`,
        );
    return {
        [modelId]: Object.fromEntries(
            Object.keys(omit(costDefinition, "date")).map((usageType) => {
                const usageCost = costDefinition[usageType as UsageType];
                const usagePrice = priceDefinition[usageType as UsageType];
                if (!usageCost || !usagePrice) {
                    throw new Error(
                        `Failed to find usage cost or price for model: ${modelId.toString()}`,
                    );
                }
                return [usageType, usagePrice - usageCost];
            }),
        ),
    };
}

/**
 * Get provider for a model ID from cost definitions
 * Works for both text and image models
 * @param modelId - The provider model ID (e.g., "gpt-5-nano-2025-08-07", "flux")
 * @returns Provider name or "unknown" if not found
 */
export function getProviderByModelId(modelId: string): string {
    const costDefinition = getActiveCostDefinition(modelId as ModelId);
    if (!costDefinition) {
        return "unknown";
    }
    return costDefinition.provider || "unknown";
}

/**
 * Enriched model information for API exposure
 */
export interface ModelInfo {
    id: string;
    aliases: string[];
    modelId: string;
    provider: string;
    pricing: {
        input_token_price?: number;
        output_token_price?: number;
        cached_token_price?: number;
        image_price?: number;
        audio_input_price?: number;
        audio_output_price?: number;
        currency: "USD";
    };
    // User-facing metadata from ServiceDefinition
    description?: string;
    input_modalities?: string[];
    output_modalities?: string[];
    tools?: boolean;
    reasoning?: boolean;
    vision?: boolean;
    audio?: boolean;
    context_window?: number;
    voices?: string[];
    community?: boolean;
    hidden?: boolean;
}

/**
 * Get enriched model information for a service
 * Combines pricing from costs with metadata from service definition
 */
export function getModelInfo(serviceId: ServiceId): ModelInfo {
    const service = SERVICE_REGISTRY[serviceId];
    const priceDefinition = getActivePriceDefinition(serviceId);
    const modelId = service.modelId;

    if (!priceDefinition) {
        throw new Error(`No price definition found for service: ${serviceId}`);
    }

    // Get provider from cost definition
    const provider = getProviderByModelId(modelId as string);

    return {
        id: serviceId as string,
        aliases: service.aliases,
        modelId: modelId as string,
        provider,
        pricing: {
            input_token_price: priceDefinition.promptTextTokens,
            output_token_price: priceDefinition.completionTextTokens,
            cached_token_price: priceDefinition.promptCachedTokens,
            image_price: priceDefinition.completionImageTokens,
            audio_input_price: priceDefinition.promptAudioTokens,
            audio_output_price: priceDefinition.completionAudioTokens,
            currency: "USD",
        },
        // User-facing metadata from service definition
        description: service.description,
        input_modalities: service.input_modalities,
        output_modalities: service.output_modalities,
        tools: service.tools,
        reasoning: service.reasoning,
        vision: service.vision,
        audio: service.audio,
        context_window: service.context_window,
        voices: service.voices,
        community: service.community,
        hidden: service.hidden,
    };
}

/**
 * Get all text models with enriched information
 */
export function getTextModelsInfo(): ModelInfo[] {
    return getTextServices().map(getModelInfo);
}

/**
 * Get all image models with enriched information
 */
export function getImageModelsInfo(): ModelInfo[] {
    return getImageServices().map(getModelInfo);
}
