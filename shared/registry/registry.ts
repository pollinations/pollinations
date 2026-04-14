import { safeRound } from "../utils";
import {
    AUDIO_SERVICES,
    type AudioModelId,
    type AudioModelName,
} from "./audio";
import {
    IMAGE_SERVICES,
    type ImageModelId,
    type ImageModelName,
} from "./image";
import { TEXT_SERVICES, type TextModelId, type TextModelName } from "./text";

const PRECISION = 8;

export type UsageType =
    | "promptTextTokens"
    | "promptCachedTokens"
    | "promptAudioTokens"
    | "promptAudioSeconds"
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

// UsagePrice is Usage with dollar amounts and a total
export type UsagePrice = Usage & {
    totalPrice: number;
};

// CostDefinition defines conversion rates from usage to dollars
export type CostDefinition = {
    date: number;
} & { [K in UsageType]?: number };

// PriceDefinition defines conversion rates for user-facing pricing
export type PriceDefinition = CostDefinition;

export type ModelId = ImageModelId | TextModelId | AudioModelId;
export type ModelName = ImageModelName | TextModelName | AudioModelName;

export type ModelDefinition<TModelId extends string = ModelId> = {
    aliases: string[];
    modelId: TModelId;
    provider: string;
    cost: CostDefinition[];
    price?: PriceDefinition[];
    // User-facing metadata
    description?: string;
    inputModalities?: string[];
    outputModalities?: string[];
    tools?: boolean;
    reasoning?: boolean;
    search?: boolean;
    codeExecution?: boolean;
    contextLength?: number;
    voices?: string[];
    isSpecialized?: boolean;
    persona?: boolean;
    paidOnly?: boolean; // Models that require paid balance only
    alpha?: boolean; // Experimental models with potential instability
    hidden?: boolean; // Hidden from /models endpoints and dashboard, but still usable via API
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

type ModelRegistryEntry = ModelDefinition & {
    price: PriceDefinition[];
};

const MODEL_REGISTRY = Object.fromEntries(
    Object.entries({
        ...TEXT_SERVICES,
        ...IMAGE_SERVICES,
        ...AUDIO_SERVICES,
    }).map(([name, service]) => [
        name,
        {
            ...service,
            cost: sortDefinitions([...service.cost]),
            price: sortDefinitions([...(service.price ?? service.cost)]),
        } as ModelRegistryEntry,
    ]),
) as Record<ModelName, ModelRegistryEntry>;

/**
 * Resolve a model name from a canonical name or alias
 * @param model - Model name or alias
 * @returns Resolved canonical model name
 * @throws Error if model is not found
 */
export function resolveModelName(model: string): ModelName {
    if (MODEL_REGISTRY[model as ModelName]) {
        return model as ModelName;
    }
    for (const [modelName, service] of Object.entries(MODEL_REGISTRY)) {
        if (service.aliases.includes(model)) {
            return modelName as ModelName;
        }
    }
    throw new Error(
        `Invalid model or alias: "${model}". Must be a valid model name or alias.`,
    );
}

/**
 * Check if a public model name exists in the registry
 */
export function isValidModel(model: ModelName | string): model is ModelName {
    return !!MODEL_REGISTRY[model as ModelName];
}

/**
 * Get all public model names
 */
export function getModels(): ModelName[] {
    return Object.keys(MODEL_REGISTRY) as ModelName[];
}

/**
 * Get text model names
 */
export function getTextModels(): TextModelName[] {
    return Object.keys(TEXT_SERVICES) as TextModelName[];
}

/**
 * Get image model names
 */
export function getImageModels(): ImageModelName[] {
    return Object.keys(IMAGE_SERVICES) as ImageModelName[];
}

/**
 * Get audio model names
 */
export function getAudioModels(): AudioModelName[] {
    return Object.keys(AUDIO_SERVICES) as AudioModelName[];
}

function filterVisible<TModelName extends ModelName>(
    ids: TModelName[],
): TModelName[] {
    return ids.filter((id) => !MODEL_REGISTRY[id]?.hidden);
}

export const getVisibleTextModels = () => filterVisible(getTextModels());
export const getVisibleImageModels = () => filterVisible(getImageModels());
export const getVisibleAudioModels = () => filterVisible(getAudioModels());

/**
 * Get a model definition by public model name
 */
export function getModelDefinition(model: ModelName): ModelRegistryEntry {
    const definition = MODEL_REGISTRY[model];
    if (!definition) {
        throw new Error(`Invalid model: "${model}"`);
    }
    return definition;
}

/**
 * Get aliases for a model
 */
export function getModelAliases(model: ModelName): readonly string[] {
    const service = MODEL_REGISTRY[model];
    return service?.aliases || [];
}

/**
 * Get active cost definition for a public model name
 */
export function getActiveCostDefinition(
    model: ModelName,
    date: Date = new Date(),
): CostDefinition | null {
    const modelDefinition = MODEL_REGISTRY[model]?.cost;
    if (!modelDefinition) return null;
    for (const definition of modelDefinition) {
        if (definition.date < date.getTime()) return definition;
    }
    return null;
}

/**
 * Get active price definition for a public model name
 */
export function getActivePriceDefinition(
    model: ModelName,
    date: Date = new Date(),
): PriceDefinition | null {
    const modelDefinition = MODEL_REGISTRY[model]?.price;
    if (!modelDefinition) return null;
    for (const definition of modelDefinition) {
        if (definition.date < date.getTime()) return definition;
    }
    return null;
}

/**
 * Calculate cost for a model based on usage
 */
export function calculateCost(model: ModelName, usage: Usage): UsageCost {
    const costDefinition = getActiveCostDefinition(model);
    if (!costDefinition)
        throw new Error(
            `Failed to get current cost for model: ${model.toString()}`,
        );
    const usageCost = convertUsage(usage, costDefinition);
    const totalCost = safeRound(
        Object.values(usageCost).reduce((total, cost) => total + cost, 0),
        PRECISION,
    );
    return {
        ...usageCost,
        totalCost,
    };
}

/**
 * Calculate price for a model based on usage
 */
export function calculatePrice(model: ModelName, usage: Usage): UsagePrice {
    const priceDefinition = getActivePriceDefinition(model);
    if (!priceDefinition)
        throw new Error(
            `Failed to get current price for model: ${model.toString()}`,
        );
    const usagePrice = convertUsage(usage, priceDefinition);
    const totalPrice = safeRound(
        Object.values(usagePrice).reduce((total, price) => total + price, 0),
        PRECISION,
    );
    return {
        ...usagePrice,
        totalPrice,
    };
}
