import { roundPollenLedgerAmount } from "../billing/precision.ts";
import { AUDIO_SERVICES, type AudioModelName } from "./audio";
import type { CostVariantContext, PricingInput } from "./cost-variants";

// Re-export so consumers can keep importing the variant API from the
// registry entry point (the helpers live in cost-variants.ts to avoid a
// module-evaluation cycle with the service maps).
export {
    type CostVariantContext,
    defineCostVariants,
    longContextAbove,
    matchResolution,
    type PricingInput,
    totalPromptTokens,
} from "./cost-variants";

import { EMBEDDING_SERVICES, type EmbeddingServiceId } from "./embeddings";
import { IMAGE_SERVICES, type ImageModelName } from "./image";
import { MODEL3D_SERVICES, type Model3dName } from "./model3d";
import { REALTIME_SERVICES, type RealtimeModelName } from "./realtime";
import { TEXT_SERVICES, type TextModelName } from "./text";

export type Category =
    | "text"
    | "image"
    | "audio"
    | "video"
    | "3d"
    | "embedding"
    | "realtime";

export const MODEL_INPUT_MODALITIES = [
    "text",
    "image",
    "audio",
    "video",
] as const;

export type ModelInputModality = (typeof MODEL_INPUT_MODALITIES)[number];

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

export type CostVariantMetadata = {
    label: string;
    description: string;
};

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
    countUnits: (output: unknown, input?: PricingInput) => number;
    // Optional provider-reported unit cost (e.g. Perplexity usage.cost)
    // resolved via the provider module's clamp-and-alert policy. Must never
    // throw. Defaults to the static unitCost when omitted.
    resolveUnitCost?: (
        output: unknown,
        model: string,
        input?: PricingInput,
    ) => number;
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

export type ModelDefinition = {
    aliases: string[];
    provider: string;
    /** Ordered model ids to try when this model's upstream fails. */
    fallbacks?: string[];
    brand: string;
    category: Category;
    cost: CostDefinition;
    // Named alternate rate sheets, merged over `cost` when selectCostVariant
    // picks one (keys not listed in a variant inherit the base rate). Rates
    // are always data — selectors return a NAME, never a number. Provider
    // tiers (long-context, resolution) each map to one named sheet here.
    costVariants?: Record<string, CostDefinition>;
    // Public explanation for every named rate sheet. Kept alongside the
    // selector so /models and the dashboard can disclose when alternate rates
    // apply without attempting to serialize selector code.
    costVariantMetadata?: Record<string, CostVariantMetadata>;
    // Picks the rate sheet for one request, evaluated once at billing time
    // inside calculateUsageBilling. Must be pure and never throw. Returning
    // undefined (or an unknown name — warned) bills at base rates. Selection
    // is code; money is data.
    selectCostVariant?: (context: CostVariantContext) => string | undefined;
    // USD-cost to Pollen-price multiplier. Required on every model — there is
    // no implicit default. Typical values: 1 (sold at cost) or 1.5 (paid markup).
    priceMultiplier: number;
    billing?: BillingRules;
    // Date the model was added to the registry (ms epoch). Set once, never updated.
    addedDate: number;
    // User-facing metadata
    title: string; // Human display name, e.g. "FLUX.1 Kontext"
    // Backward compatibility: public descriptions currently include the title
    // prefix ("Title - description"). Prefer `title` for display names.
    description?: string;
    inputModalities?: ModelInputModality[];
    outputModalities?: string[];
    tools?: boolean;
    reasoning?: boolean;
    search?: boolean;
    // Supported Perplexity search-context sizes; first entry is the default.
    // A single entry is fixed and ignores request overrides.
    searchContextSizes?: ("low" | "high")[];
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
    supportedEndpoints?: string[]; // Override the default endpoints for specialized models
    // Supported output resolutions; first entry is the default.
    resolutions?: string[];
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

function derivePrice(
    costDefinition: CostDefinition,
    priceMultiplier: number,
): PriceDefinition {
    if (priceMultiplier === 1) return costDefinition;
    return Object.fromEntries(
        Object.entries(costDefinition).map(([k, v]) => [
            k,
            (v as number) * priceMultiplier,
        ]),
    ) as PriceDefinition;
}

// Resolve the variant name for one request. Never throws: a throwing or
// misconfigured selector logs and falls back to base rates — a selector bug
// must never drop the tracking event or bill zero.
export type CostVariantSelectionStatus =
    | "base"
    | "selected"
    | "unknown"
    | "selector_error";

type CostVariantSelection = {
    name?: string;
    status: CostVariantSelectionStatus;
};

function selectCostVariant(
    model: string,
    usage: Usage,
    svc: ModelDefinition,
    input?: PricingInput,
): CostVariantSelection {
    if (!svc.selectCostVariant) return { status: "base" };
    let name: string | undefined;
    try {
        name = svc.selectCostVariant({ usage, input });
    } catch (error) {
        console.warn(
            `[registry] selectCostVariant threw for model=${model} — billing base rates`,
            error,
        );
        return { status: "selector_error" };
    }
    if (name === undefined) return { status: "base" };
    if (!svc.costVariants?.[name]) {
        console.warn(
            `[registry] Unknown cost variant "${name}" for model=${model} — billing base rates`,
        );
        return { status: "unknown" };
    }
    return { name, status: "selected" };
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
    svc: ModelDefinition,
    output: unknown,
    model: string,
    input?: PricingInput,
): BillingAdjustment[] {
    const adjustments: BillingAdjustment[] = [];
    for (const rule of svc.billing?.adjustments ?? []) {
        const units = rule.countUnits(output, input);
        if (units === 0) continue;
        const unitCost =
            rule.resolveUnitCost?.(output, model, input) ?? rule.unitCost;
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

// Full billing for one model definition. Fallbacks rate the served and quoted
// definitions independently because their costs, prices, and rules may differ.
export type UsageBilling = {
    cost: UsageCost;
    price: UsagePrice;
    adjustments: BillingAdjustment[];
    // Per-unit Pollen price sheet actually applied (effective cost ×
    // multiplier). Telemetry must record THIS sheet, not the request-time
    // base sheet, so recorded rates always reproduce the billed totals.
    priceDefinition: PriceDefinition;
    // Name of the applied cost variant, if any (financial identity — distinct
    // from modelUsed, which stays observational).
    costVariant?: string;
    // Distinguishes a normal base-rate request from selector failures that
    // safely fell back to base rates.
    costVariantStatus: CostVariantSelectionStatus;
    /**
     * What the model that actually ran would have been charged for this usage.
     * Equal to `price.totalPrice` unless a fallback served, where it is what
     * bounds the serving owner's reward — they are paid on their own listing,
     * not on the (higher) one the caller bought.
     */
    servedPrice: number;
};

export type UsageBillingInput = {
    model: string;
    usage: Usage;
    /** Whose upstream ran — decides what the generation cost us. */
    servedBy: ModelDefinition;
    /**
     * Whose listing the caller bought — decides what they are charged. Defaults
     * to the model that served, which is every case except a fallback.
     */
    quotedBy?: ModelDefinition;
    output?: unknown;
    /**
     * Normalized request facts that select a cost variant. Applied to both
     * sides of a fallback: each definition picks the variant from its own
     * sheet, so the caller's tier and the server's tier stay independent.
     */
    input?: PricingInput;
};

/**
 * Rates one usage against one model definition.
 *
 * Price is the cost scaled by that definition's multiplier, so it cannot be
 * borrowed across definitions: community endpoints carry per-usage-type rate
 * vectors their owners set, and rescaling one owner's cost by another's
 * multiplier would invent a price neither of them published.
 */
function rateAgainst(
    model: string,
    usage: Usage,
    svc: ModelDefinition,
    output?: unknown,
    input?: PricingInput,
): Omit<UsageBilling, "servedPrice"> {
    const adjustments = calculateBillingAdjustments(svc, output, model, input);
    const adjustmentCost = adjustments.reduce((total, a) => total + a.cost, 0);
    const adjustmentPrice = adjustments.reduce(
        (total, a) => total + a.price,
        0,
    );

    const selection = selectCostVariant(model, usage, svc, input);
    const costVariant = selection.name;
    const effectiveCost = costVariant
        ? { ...svc.cost, ...svc.costVariants?.[costVariant] }
        : svc.cost;
    const usageCost = calculateLinearCost(model, usage, effectiveCost);
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
    const price = {
        ...usagePrice,
        totalPrice: roundPollenLedgerAmount(tokenTotalPrice + adjustmentPrice),
    };

    return {
        cost,
        price,
        adjustments,
        priceDefinition: derivePrice(effectiveCost, svc.priceMultiplier),
        costVariant,
        costVariantStatus: selection.status,
    };
}

/**
 * What the generation cost us, and what the caller pays for it.
 *
 * These come apart exactly when a fallback served: the caller is charged the
 * listing they asked for, while cost — and the serving owner's reward — follow
 * the model that actually ran. Charging the server's price instead would let
 * the amount on the invoice depend on which upstream happened to be up.
 */
export function calculateUsageBilling({
    model,
    usage,
    servedBy,
    quotedBy = servedBy,
    output,
    input,
}: UsageBillingInput): UsageBilling {
    const served = rateAgainst(model, usage, servedBy, output, input);
    if (quotedBy === servedBy) {
        return { ...served, servedPrice: served.price.totalPrice };
    }
    // Rated independently rather than rescaled: see rateAgainst.
    const quoted = rateAgainst(model, usage, quotedBy, output, input);
    const selectionStatuses = [
        served.costVariantStatus,
        quoted.costVariantStatus,
    ];
    const costVariantStatus = selectionStatuses.includes("selector_error")
        ? "selector_error"
        : selectionStatuses.includes("unknown")
          ? "unknown"
          : quoted.costVariantStatus;
    return {
        cost: served.cost,
        adjustments: served.adjustments,
        price: quoted.price,
        servedPrice: served.price.totalPrice,
        // The rate sheet and variant identify what the caller was billed. The
        // status is a health signal, so a failure on either side takes priority.
        priceDefinition: quoted.priceDefinition,
        costVariant: quoted.costVariant,
        costVariantStatus,
    };
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
    svc: ModelDefinition,
): PriceDefinition {
    return derivePrice(svc.cost, svc.priceMultiplier);
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
    input?: PricingInput,
): UsageCost {
    const svc = MODEL_REGISTRY[model];
    if (!svc)
        throw new Error(
            `Failed to get current cost for model: ${model.toString()}`,
        );
    return calculateCostForModelDefinition(model, usage, svc, output, input);
}

export function calculateCostForModelDefinition(
    model: string,
    usage: Usage,
    svc: ModelDefinition,
    output?: unknown,
    input?: PricingInput,
): UsageCost {
    return calculateUsageBilling({ model, usage, servedBy: svc, output, input })
        .cost;
}

/**
 * Calculate price for a model based on usage
 */
export function calculatePrice(
    model: ModelName,
    usage: Usage,
    output?: unknown,
    input?: PricingInput,
): UsagePrice {
    const svc = MODEL_REGISTRY[model];
    if (!svc)
        throw new Error(
            `Failed to get current price for model: ${model.toString()}`,
        );
    return calculatePriceForModelDefinition(model, usage, svc, output, input);
}

export function calculatePriceForModelDefinition(
    model: string,
    usage: Usage,
    svc: ModelDefinition,
    output?: unknown,
    input?: PricingInput,
): UsagePrice {
    return calculateUsageBilling({ model, usage, servedBy: svc, output, input })
        .price;
}
