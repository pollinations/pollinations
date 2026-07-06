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
import { MODEL3D_SERVICES, type Model3dId, type Model3dName } from "./model3d";
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
    | "3d"
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
    | RealtimeModelId
    | Model3dId;
export type ModelName =
    | ImageModelName
    | TextModelName
    | AudioModelName
    | EmbeddingServiceId
    | RealtimeModelName
    | Model3dName;

export type VideoCapability =
    | "start_frame"
    | "end_frame"
    | "keyframes"
    | "audio_output";

export type BillingAdjustmentRule = {
    id: string;
    description: string;
    kind: string;
    unit: string;
    unitCost: number;
    // Counts billable units from the response output (stream outputs carry a
    // `streamEvents` array). Returning 0 skips the rule for this request.
    // Provider-specific parsing lives with the rule's provider module
    // (gemini-billing.ts, perplexity-billing.ts) — not in the registry.
    countUnits: (output: unknown) => number;
    // Optional provider-reported unit cost (e.g. Perplexity usage.cost)
    // resolved via the provider module's clamp-and-alert policy. Must never
    // throw. Defaults to the static unitCost when omitted.
    resolveUnitCost?: (output: unknown, modelId: string) => number;
};

export type BillingRules = {
    adjustments?: BillingAdjustmentRule[];
};

// Per-rule billing breakdown, returned in parallel to the numeric usage maps.
// The model's single priceMultiplier applies uniformly to tokens and
// adjustments alike (there is no per-rule multiplier), so adjustment prices
// are always derivable from costs: price = cost × svc.priceMultiplier.
export type BillingAdjustment = {
    ruleId: string;
    kind: string;
    unit: string;
    units: number;
    unitCost: number;
    cost: number;
    price: number;
};

export type ModelDefinition<TModelId extends string = ModelId> = {
    aliases: string[];
    modelId: TModelId;
    provider: string;
    // Optional secondary provider for binary-asset models with provider-level
    // fallback (3D only, as of this field). Purely descriptive metadata for
    // /models transparency — does not drive fallback logic, which lives in
    // the handler dispatch code.
    fallbackProvider?: string;
    brand: string;
    category: Category;
    // Model-vs-agent distinction for community endpoints. Absent = plain
    // model. "agent" marks endpoints that run multi-step/tool-using logic
    // behind the chat-completions shape.
    kind?: "model" | "agent";
    cost: CostDefinition;
    // USD-cost to Pollen-price multiplier. Required on every model — there is
    // no implicit default. Typical values: 1 (sold at cost) or 1.5 (paid markup).
    priceMultiplier: number;
    // Hard ceiling on the total Pollen price billed for one request (tokens +
    // adjustments). Upstream-reported usage is not otherwise bounded, so for
    // community endpoints this is the caller's protection against inflated
    // usage reports. Clamps loudly in calculateUsageBilling.
    maxRequestPrice?: number;
    billing?: BillingRules;
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
    // Flat per-generation pricing (one fee per request, independent of output
    // size/length). Lets the pricing UI show a "/gen" badge instead of guessing
    // a per-second rate from a per-token cost. Used to disambiguate flat-fee
    // audio (e.g. Stable Audio) from per-character TTS, which share cost fields.
    flatRate?: boolean;
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
    model: string,
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
    model: string,
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

// Single source of truth: the per-rule breakdown. Cost/price totals are derived
// from this so there is no duplicated rule loop. The registry stays generic:
// each rule brings its own counter and (optionally) provider-cost resolution.
export function calculateBillingAdjustments(
    svc: ModelDefinition<string>,
    output: unknown,
): BillingAdjustment[] {
    const adjustments: BillingAdjustment[] = [];
    for (const rule of svc.billing?.adjustments ?? []) {
        const units = rule.countUnits(output);
        if (units === 0) continue;
        const unitCost =
            rule.resolveUnitCost?.(output, svc.modelId) ?? rule.unitCost;
        const cost = units * unitCost;
        adjustments.push({
            ruleId: rule.id,
            kind: rule.kind,
            unit: rule.unit,
            units,
            unitCost,
            cost,
            price: cost * svc.priceMultiplier,
        });
    }
    return adjustments;
}

// Full billing for one generation, computed in a single pass: the adjustment
// rules are walked exactly once (so clamp/absence warnings log once per
// request) and cost, price, and the per-rule breakdown all derive from it.
export type UsageBilling = {
    cost: UsageCost;
    price: UsagePrice;
    adjustments: BillingAdjustment[];
};

export function calculateUsageBilling(
    model: string,
    usage: Usage,
    svc: ModelDefinition<string>,
    output?: unknown,
): UsageBilling {
    const adjustments = calculateBillingAdjustments(svc, output);
    const adjustmentCost = adjustments.reduce((total, a) => total + a.cost, 0);
    const adjustmentPrice = adjustments.reduce(
        (total, a) => total + a.price,
        0,
    );

    const usageCost = calculateLinearCost(model, usage, svc.cost);
    const cost =
        adjustmentCost === 0
            ? usageCost
            : {
                  ...usageCost,
                  totalCost: usageCost.totalCost + adjustmentCost,
              };

    const usagePrice = Object.fromEntries(
        Object.entries(usageCost)
            .filter(([usageType]) => usageType !== "totalCost")
            .map(([usageType, usageTypeCost]) => [
                usageType,
                (usageTypeCost as number) * svc.priceMultiplier,
            ]),
    ) as Usage;
    const tokenTotalPrice = Object.values(usagePrice).reduce(
        (total, price) => total + price,
        0,
    );
    const rawTotalPrice = roundPollenLedgerAmount(
        tokenTotalPrice + adjustmentPrice,
    );
    const maxRequestPrice = svc.maxRequestPrice;
    const clamped =
        maxRequestPrice !== undefined && rawTotalPrice > maxRequestPrice;
    if (clamped) {
        console.error(
            `[billing] ${model}: request price ${rawTotalPrice} exceeds maxRequestPrice ${maxRequestPrice} — clamping. Upstream-reported usage may be inflated.`,
        );
    }
    const price = {
        ...usagePrice,
        totalPrice: clamped
            ? roundPollenLedgerAmount(maxRequestPrice)
            : rawTotalPrice,
    };
    const clampedCost = clamped
        ? {
              ...cost,
              totalCost: Math.min(
                  cost.totalCost,
                  roundPollenLedgerAmount(
                      maxRequestPrice / svc.priceMultiplier,
                  ),
              ),
          }
        : cost;

    return { cost: clampedCost, price, adjustments };
}

const MODEL_REGISTRY = {
    ...TEXT_SERVICES,
    ...IMAGE_SERVICES,
    ...AUDIO_SERVICES,
    ...EMBEDDING_SERVICES,
    ...REALTIME_SERVICES,
    ...MODEL3D_SERVICES,
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

/**
 * Get 3D model names
 */
function getModel3dModels(): Model3dName[] {
    return Object.keys(MODEL3D_SERVICES) as Model3dName[];
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
export const getVisibleModel3dModels = () => filterVisible(getModel3dModels());

/**
 * Get a model definition from the bundled registry.
 *
 * This only covers built-in Pollinations models. Runtime models, such as
 * community endpoints, should be resolved at the request boundary and then
 * passed around as a `ModelDefinition`.
 */
export function getRegistryModelDefinition(model: ModelName): ModelDefinition {
    const definition = MODEL_REGISTRY[model];
    if (!definition) {
        throw new Error(`Invalid model: "${model}"`);
    }
    return definition;
}

export function getPriceDefinitionForModel(
    svc: ModelDefinition<string>,
): PriceDefinition {
    return derivePrice(svc);
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
    return getPriceDefinitionForModel(svc);
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
    return calculateCostForModelDefinition(model, usage, svc, output);
}

export function calculateCostForModelDefinition(
    model: string,
    usage: Usage,
    svc: ModelDefinition<string>,
    output?: unknown,
): UsageCost {
    return calculateUsageBilling(model, usage, svc, output).cost;
}

/**
 * Calculate cost from an explicit cost definition.
 */
export function calculateCostWithDefinition(
    model: string,
    usage: Usage,
    costDefinition: CostDefinition,
): UsageCost {
    return calculateLinearCost(model, usage, costDefinition);
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
    return calculatePriceForModelDefinition(model, usage, svc, output);
}

export function calculatePriceForModelDefinition(
    model: string,
    usage: Usage,
    svc: ModelDefinition<string>,
    output?: unknown,
): UsagePrice {
    return calculateUsageBilling(model, usage, svc, output).price;
}

/**
 * Calculate price from an explicit price definition.
 */
export function calculatePriceWithDefinition(
    model: string,
    usage: Usage,
    priceDefinition: PriceDefinition,
): UsagePrice {
    const usagePrice = convertUsage(usage, priceDefinition, model);
    const totalPrice = roundPollenLedgerAmount(
        Object.values(usagePrice).reduce((total, price) => total + price, 0),
    );
    return {
        ...usagePrice,
        totalPrice,
    };
}
