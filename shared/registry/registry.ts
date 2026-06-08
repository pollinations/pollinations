import { roundPollenLedgerAmount } from "../billing/precision.ts";
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
import {
    REALTIME_SERVICES,
    type RealtimeModelId,
    type RealtimeModelName,
} from "./realtime";
import { TEXT_SERVICES, type TextModelId, type TextModelName } from "./text";

export type Category =
    | "text"
    | "image"
    | "audio"
    | "video"
    | "embedding"
    | "realtime";

export type UsageType =
    | "promptTextTokens"
    | "promptCachedTokens"
    | "promptCacheWriteTokens"
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

// USD-equivalent amounts per usage type, plus what Pollinations pays the provider.
export type UsageCost = Usage & {
    totalCost: number;
};

// Pollen amounts per usage type, plus what the user is billed.
export type UsagePrice = Usage & {
    totalPrice: number;
};

// Provider cost rates in USD-equivalent per usage unit.
export type CostDefinition = { [K in UsageType]?: number };

// User-facing charge rates in Pollen per usage unit, derived from cost × multiplier.
export type PriceDefinition = CostDefinition;

export type ModelId =
    | ImageModelId
    | TextModelId
    | AudioModelId
    | EmbeddingModelId
    | RealtimeModelId;
export type ModelName =
    | ImageModelName
    | TextModelName
    | AudioModelName
    | EmbeddingServiceId
    | RealtimeModelName;

export type VideoCapability =
    | "start_frame"
    | "end_frame"
    | "keyframes"
    | "audio_output";

export type BillingPolicyInput<TModelId extends string = string> = {
    usage: Usage;
    output?: unknown;
    model: ModelDefinition<TModelId>;
    linearCost: (costDefinition?: CostDefinition) => UsageCost;
};

export type BillingPolicy<TModelId extends string = string> = {
    id: string;
    description: string;
    calculateCost: (input: BillingPolicyInput<TModelId>) => UsageCost;
};

export type ModelDefinition<TModelId extends string = ModelId> = {
    aliases: string[];
    modelId: TModelId;
    provider: string;
    brand: string;
    category: Category;
    cost: CostDefinition;
    // USD-cost to Pollen-price multiplier. Required on every model — there is
    // no implicit default. Typical values: 1 (sold at cost) or 1.5 (paid markup).
    priceMultiplier: number;
    billingPolicy?: BillingPolicy<TModelId>;
    // Date the model was added to the registry (ms epoch). Set once, never updated.
    addedDate: number;
    // User-facing metadata
    title: string; // Human display name, e.g. "FLUX.1 Kontext"
    // Backward compatibility: public descriptions currently include the title
    // prefix ("Title - description"). Prefer `title` for display names.
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
    paidOnly?: boolean; // Models that require paid balance only
    alpha?: boolean; // Experimental models with potential instability
    hidden?: boolean; // Hidden from /models endpoints and dashboard, but still usable via API
    videoCapabilities?: VideoCapability[]; // Video-only: which frame controls the provider supports
    maxReferenceImages?: number; // Models with image input: effective accepted reference images
    maxReferenceVideos?: number; // Models with video input: effective accepted reference videos
};

// Helper: Convert usage counts to rated USD-equivalent cost or Pollen charge.
// When a usage type is reported by upstream but the registry has no rate for it,
// log a warning (so we know which (model, usageType) pair needs adding) and bill
// that line as 0. Throwing here drops the whole tracking event and creates a
// silent billing leak.
function convertUsage(
    usage: Usage,
    rateDefinition: CostDefinition,
    model: ModelName,
): Usage {
    const convertedUsage = Object.fromEntries(
        Object.entries(usage).map(([usageType, amount]) => {
            if (amount === 0) return [usageType, 0];
            const usageTypeWithFallback =
                usageType === "completionReasoningTokens"
                    ? "completionTextTokens"
                    : usageType;
            const conversionRate =
                rateDefinition[usageTypeWithFallback as UsageType];
            if (conversionRate === undefined) {
                console.warn(
                    `[registry] Missing conversion rate: model=${model.toString()} usageType=${usageType} amount=${amount} — billing 0 for this line`,
                );
                return [usageType, 0];
            }
            return [usageType, amount * conversionRate];
        }),
    );
    return convertedUsage as Usage;
}

function derivePrice(svc: ModelDefinition): PriceDefinition {
    const m = svc.priceMultiplier;
    if (m === 1) return svc.cost;
    return Object.fromEntries(
        Object.entries(svc.cost).map(([k, v]) => [k, (v as number) * m]),
    ) as PriceDefinition;
}

function calculateLinearCost(
    model: ModelName,
    usage: Usage,
    costDefinition: CostDefinition,
): UsageCost {
    const usageCost = convertUsage(usage, costDefinition, model);
    const totalCost = Object.values(usageCost).reduce(
        (total, cost) => total + cost,
        0,
    );
    return {
        ...usageCost,
        totalCost,
    };
}

const MODEL_REGISTRY = {
    ...TEXT_SERVICES,
    ...IMAGE_SERVICES,
    ...AUDIO_SERVICES,
    ...EMBEDDING_SERVICES,
    ...REALTIME_SERVICES,
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
 * Get all public model names
 */
export function getModels(): ModelName[] {
    return Object.keys(MODEL_REGISTRY) as ModelName[];
}

/**
 * Get text model names
 */
function getTextModels(): TextModelName[] {
    return Object.keys(TEXT_SERVICES) as TextModelName[];
}

/**
 * Get image model names
 */
function getImageModels(): ImageModelName[] {
    return Object.keys(IMAGE_SERVICES) as ImageModelName[];
}

/**
 * Get audio model names
 */
function getAudioModels(): AudioModelName[] {
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
export const getVisibleEmbeddingModels = () =>
    filterVisible(Object.keys(EMBEDDING_SERVICES) as EmbeddingServiceId[]);
export const getVisibleRealtimeModels = () =>
    filterVisible(Object.keys(REALTIME_SERVICES) as RealtimeModelName[]);

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
 * Get cost definition for a public model name
 */
export function getCostDefinition(model: ModelName): CostDefinition | null {
    return MODEL_REGISTRY[model]?.cost ?? null;
}

/**
 * Get Pollen price definition for a public model name (cost × multiplier)
 */
export function getPriceDefinition(model: ModelName): PriceDefinition | null {
    const svc = MODEL_REGISTRY[model];
    if (!svc) return null;
    return derivePrice(svc);
}

/**
 * Calculate cost for a model based on usage
 */
export function calculateCost(
    model: ModelName,
    usage: Usage,
    output?: unknown,
): UsageCost {
    const svc = MODEL_REGISTRY[model];
    if (!svc)
        throw new Error(
            `Failed to get current cost for model: ${model.toString()}`,
        );
    const linearCost = (costDefinition = svc.cost) =>
        calculateLinearCost(model, usage, costDefinition);

    return svc.billingPolicy
        ? svc.billingPolicy.calculateCost({
              usage,
              output,
              model: svc,
              linearCost,
          })
        : linearCost();
}

/**
 * Calculate price for a model based on usage
 */
export function calculatePrice(
    model: ModelName,
    usage: Usage,
    output?: unknown,
): UsagePrice {
    const svc = MODEL_REGISTRY[model];
    if (!svc)
        throw new Error(
            `Failed to get current price for model: ${model.toString()}`,
        );
    const usageCost = calculateCost(model, usage, output);
    const usagePrice = Object.fromEntries(
        Object.entries(usageCost)
            .filter(([usageType]) => usageType !== "totalCost")
            .map(([usageType, cost]) => [
                usageType,
                (cost as number) * svc.priceMultiplier,
            ]),
    ) as Usage;
    const totalPrice = roundPollenLedgerAmount(
        usageCost.totalCost * svc.priceMultiplier,
    );
    return {
        ...usagePrice,
        totalPrice,
    };
}
