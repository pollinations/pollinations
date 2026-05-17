import { safeRound } from "../utils";
import {
    AUDIO_SERVICES,
    type AudioModelId,
    type AudioModelName,
} from "./audio";
import {
    EMBEDDING_SERVICES,
    type EmbeddingModelId,
    type EmbeddingServiceId,
} from "./embeddings";
import {
    IMAGE_SERVICES,
    type ImageModelId,
    type ImageModelName,
} from "./image";
import { TEXT_SERVICES, type TextModelId, type TextModelName } from "./text";

const PRECISION = 8;

export type Category = "text" | "image" | "audio" | "video" | "embedding";

export type UsageType =
    | "promptTextTokens"
    | "promptCachedTokens"
    | "promptAudioTokens"
    | "promptAudioSeconds"
    | "promptImageTokens"
    | "promptVideoTokens"
    | "completionTextTokens"
    | "completionReasoningTokens"
    | "completionAudioTokens"
    | "completionAudioSeconds"
    | "completionImageTokens"
    | "completionVideoSeconds"
    | "completionVideoTokens";

// Usage represents raw usage metrics (tokens, seconds, etc.)
export type Usage = { [K in UsageType]?: number };

// Dollar amounts per usage type, plus a total cost (what Pollinations pays the provider)
export type UsageCost = Usage & {
    totalCost: number;
};

// Dollar amounts per usage type, plus a total price (what the user is billed)
export type UsagePrice = Usage & {
    totalPrice: number;
};

// Conversion rates (dollars per usage unit) used to compute provider cost
export type CostDefinition = { [K in UsageType]?: number };

// Conversion rates used to compute user-facing price; derived from cost × multiplier
export type PriceDefinition = CostDefinition;

export type ModelId =
    | ImageModelId
    | TextModelId
    | AudioModelId
    | EmbeddingModelId;
export type ModelName =
    | ImageModelName
    | TextModelName
    | AudioModelName
    | EmbeddingServiceId;

export type VideoCapability =
    | "start_frame"
    | "end_frame"
    | "keyframes"
    | "audio_output";

export type ModelDefinition<TModelId extends string = ModelId> = {
    aliases: string[];
    modelId: TModelId;
    provider: string;
    brand: string;
    category: Category;
    cost: CostDefinition;
    // Per-model override for the cost→price multiplier. Defaults to 1.5 for
    // paidOnly models and 1.0 for free models.
    priceMultiplier?: number;
    // Date the model was added to the registry (ms epoch). Set once, never updated.
    addedDate: number;
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
    videoCapabilities?: VideoCapability[]; // Video-only: which frame controls the provider supports
};

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

function resolvePriceMultiplier(svc: ModelDefinition): number {
    return svc.priceMultiplier ?? (svc.paidOnly ? 1.5 : 1.0);
}

// Round derived rates to 15 decimals to suppress float-multiplication noise
// (e.g. 0.05 * 1.5e-6 → 7.500000000000001e-8). Per-token rates can be as small
// as 1e-9, so PRECISION=8 used elsewhere is too coarse here.
const DERIVED_RATE_PRECISION = 15;

function derivePrice(svc: ModelDefinition): PriceDefinition {
    const m = resolvePriceMultiplier(svc);
    if (m === 1) return svc.cost;
    return Object.fromEntries(
        Object.entries(svc.cost).map(([k, v]) => [
            k,
            safeRound((v as number) * m, DERIVED_RATE_PRECISION),
        ]),
    ) as PriceDefinition;
}

const MODEL_REGISTRY = {
    ...TEXT_SERVICES,
    ...IMAGE_SERVICES,
    ...AUDIO_SERVICES,
    ...EMBEDDING_SERVICES,
} as Record<ModelName, ModelDefinition>;

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

/**
 * Get embedding model names (service IDs)
 */
export function getEmbeddingModels(): EmbeddingServiceId[] {
    return Object.keys(EMBEDDING_SERVICES) as EmbeddingServiceId[];
}

function filterVisible<TModelName extends ModelName>(
    ids: TModelName[],
): TModelName[] {
    return ids.filter((id) => !MODEL_REGISTRY[id]?.hidden);
}

export const getVisibleTextModels = () => filterVisible(getTextModels());
export const getVisibleImageModels = () => filterVisible(getImageModels());
export const getVisibleAudioModels = () => filterVisible(getAudioModels());
export const getVisibleEmbeddingModels = () =>
    filterVisible(getEmbeddingModels());

/**
 * Get a model definition by public model name
 */
export function getModelDefinition(model: ModelName): ModelDefinition {
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
 * Get cost definition for a public model name
 */
export function getCostDefinition(model: ModelName): CostDefinition | null {
    return MODEL_REGISTRY[model]?.cost ?? null;
}

/**
 * Get price definition for a public model name (cost × multiplier)
 */
export function getPriceDefinition(model: ModelName): PriceDefinition | null {
    const svc = MODEL_REGISTRY[model];
    if (!svc) return null;
    return derivePrice(svc);
}

/**
 * Calculate cost for a model based on usage
 */
export function calculateCost(model: ModelName, usage: Usage): UsageCost {
    const costDefinition = getCostDefinition(model);
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
    const priceDefinition = getPriceDefinition(model);
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
