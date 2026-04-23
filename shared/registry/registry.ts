import { safeRound } from "../utils";
import { AUDIO_SERVICES, type AudioModelName } from "./audio";
import { IMAGE_SERVICES, type ImageModelName } from "./image";
import { TEXT_SERVICES, type TextModelName } from "./text";

const PRECISION = 8;

export type Category = "text" | "image" | "audio" | "video";
export type Modality = "text" | "image" | "audio" | "video";
export type Capability = "tools" | "reasoning" | "search" | "codeExecution";
export type ModelProfile = "fast" | "pro";

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
export type CostDefinition = { [K in UsageType]?: number };

// PriceDefinition defines conversion rates for customer pricing
export type PriceDefinition = CostDefinition;

export type ModelName = ImageModelName | TextModelName | AudioModelName;

export type ModelDefinition = {
    brand: string;
    provider: string;
    version?: string;
    aliases: string[];
    description?: string;
    category: Category;
    profile?: ModelProfile;
    inputModalities?: Modality[];
    outputModalities?: Modality[];
    capabilities?: Capability[];
    contextLength?: number;
    voices?: string[];
    alpha?: boolean;
    hidden?: boolean;
    cost: CostDefinition;
    price?: PriceDefinition;
    introducedAt?: number;
    // Compatibility fields that still drive existing product behavior.
    paidOnly?: boolean;
    isSpecialized?: boolean;
    persona?: boolean;
};

export type ModelRegistryEntry = ModelDefinition & {
    price: PriceDefinition;
    tools?: boolean;
    reasoning?: boolean;
    search?: boolean;
    codeExecution?: boolean;
};

type CapabilityCarrier = {
    capabilities?: readonly Capability[];
};

export function hasCapability(
    definition: CapabilityCarrier | undefined,
    capability: Capability,
): boolean {
    return definition?.capabilities?.includes(capability) ?? false;
}

function toRegistryEntry(service: ModelDefinition): ModelRegistryEntry {
    return {
        ...service,
        price: service.price ?? service.cost,
        tools: hasCapability(service, "tools") || undefined,
        reasoning: hasCapability(service, "reasoning") || undefined,
        search: hasCapability(service, "search") || undefined,
        codeExecution: hasCapability(service, "codeExecution") || undefined,
    };
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

const MODEL_REGISTRY = Object.fromEntries(
    Object.entries({
        ...TEXT_SERVICES,
        ...IMAGE_SERVICES,
        ...AUDIO_SERVICES,
    }).map(([name, service]) => [name, toRegistryEntry(service)]),
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

export function modelHasCapability(
    model: ModelName,
    capability: Capability,
): boolean {
    return hasCapability(getModelDefinition(model), capability);
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
): CostDefinition | null {
    return MODEL_REGISTRY[model]?.cost ?? null;
}

/**
 * Get active price definition for a public model name
 */
export function getActivePriceDefinition(
    model: ModelName,
): PriceDefinition | null {
    return MODEL_REGISTRY[model]?.price ?? null;
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
