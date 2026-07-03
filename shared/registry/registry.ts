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

export type BillingAdjustmentCounter =
    | "geminiGroundedPrompt"
    | "geminiWebSearchQueries"
    | "perplexityRequest";

export type ProviderReportedUnitCostSource = "perplexityUsageCostRequest";
export type PerplexitySearchContextSize = "low" | "medium" | "high";

export type BillingTierRule = {
    id: string;
    description: string;
    when: {
        promptTokensGt: number;
    };
    cost: CostDefinition;
};

export type BillingAdjustmentRule = {
    id: string;
    description: string;
    kind: string;
    unit: string;
    count: BillingAdjustmentCounter;
    unitCost: number;
    unitCostsBySearchContextSize?: Record<PerplexitySearchContextSize, number>;
    providerReportedUnitCost?: ProviderReportedUnitCostSource;
    priceMultiplier?: number;
    when?: "grounded" | "always";
};

export type BillingRules = {
    tiers?: BillingTierRule[];
    adjustments?: BillingAdjustmentRule[];
};

export type BillingAdjustmentBreakdown = {
    ruleId: string;
    kind: string;
    units: number;
    unitCost: number;
    cost: number;
    price: number;
};

export type UsageBillingWithAdjustments = {
    cost: UsageCost;
    price: UsagePrice;
    adjustments: BillingAdjustmentBreakdown[];
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
    cost: CostDefinition;
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

function getPromptTokenCount(usage: Usage): number {
    return (
        (usage.promptTextTokens ?? 0) +
        (usage.promptCachedTokens ?? 0) +
        (usage.promptAudioTokens ?? 0) +
        (usage.promptImageTokens ?? 0) +
        (usage.promptVideoTokens ?? 0)
    );
}

type GroundingMetadata = {
    webSearchQueries?: unknown[];
    retrievalQueries?: unknown[];
    groundingSupports?: unknown[];
    groundingChunks?: unknown[];
};

type GroundedOutputChoice = {
    groundingMetadata?: GroundingMetadata;
};

type GroundedOutput = {
    choices?: GroundedOutputChoice[];
    streamEvents?: GroundedOutput[];
};

function getGroundingMetadataEntries(output: unknown): GroundingMetadata[] {
    const o = output as GroundedOutput | undefined;
    const events = o?.streamEvents ?? (o ? [o] : []);
    const entries: GroundingMetadata[] = [];
    for (const event of events) {
        for (const choice of event.choices ?? []) {
            if (choice.groundingMetadata)
                entries.push(choice.groundingMetadata);
        }
    }
    return entries;
}

function stringValue(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value : undefined;
}

function getGeminiGroundingWebSearchQueryCount(output: unknown): number {
    const queries = new Set<string>();
    for (const metadata of getGroundingMetadataEntries(output)) {
        for (const q of metadata.webSearchQueries ?? []) {
            const query = stringValue(q);
            if (query) queries.add(query);
        }
    }
    return queries.size;
}

function hasWebGroundingChunk(metadata: GroundingMetadata): boolean {
    const chunks = metadata.groundingChunks ?? [];
    if (!Array.isArray(chunks)) return false;
    for (const chunk of chunks) {
        const web = (chunk as { web?: unknown } | undefined)?.web;
        if (!web || typeof web !== "object") continue;
        const uri = stringValue((web as { uri?: unknown }).uri);
        if (uri) return true;
    }
    return false;
}

function hasSupportedWebGroundingChunk(metadata: GroundingMetadata): boolean {
    if (!hasWebGroundingChunk(metadata)) return false;
    const supports = metadata.groundingSupports ?? [];
    if (!Array.isArray(supports) || supports.length === 0) {
        return true;
    }
    const chunks = metadata.groundingChunks ?? [];
    if (!Array.isArray(chunks)) return false;
    for (const support of supports) {
        const indices = (support as { groundingChunkIndices?: unknown })
            ?.groundingChunkIndices;
        if (!Array.isArray(indices)) continue;
        for (const index of indices) {
            if (typeof index !== "number") continue;
            const web = (chunks[index] as { web?: unknown } | undefined)?.web;
            if (
                web &&
                typeof web === "object" &&
                stringValue((web as { uri?: unknown }).uri)
            ) {
                return true;
            }
        }
    }
    return false;
}

function hasGeminiGoogleSearchGrounding(output: unknown): boolean {
    for (const metadata of getGroundingMetadataEntries(output)) {
        if (
            (metadata.webSearchQueries ?? []).some(
                (query) => stringValue(query) !== undefined,
            )
        ) {
            return true;
        }
        if (hasSupportedWebGroundingChunk(metadata)) return true;
    }
    return false;
}

function countBillingAdjustmentUnits(
    counter: BillingAdjustmentCounter,
    output: unknown,
): number {
    if (counter === "perplexityRequest") return 1;
    if (counter === "geminiGroundedPrompt") {
        return hasGeminiGoogleSearchGrounding(output) ? 1 : 0;
    }
    return getGeminiGroundingWebSearchQueryCount(output);
}

type PerplexityCostOutput = {
    usage?: {
        cost?: {
            request_cost?: unknown;
        };
        search_context_size?: unknown;
    };
    billingRequest?: {
        webSearchOptionsSearchContextSize?: PerplexitySearchContextSize;
    };
    streamEvents?: unknown[];
};

type ProviderRequestCostRead =
    | { status: "present"; value: number }
    | { status: "absent" }
    | { status: "malformed"; reason: string };

function readProviderRequestCostState(event: unknown): ProviderRequestCostRead {
    const cost = (event as PerplexityCostOutput | undefined)?.usage?.cost;
    if (cost == null) return { status: "absent" };
    if (typeof cost !== "object") {
        return {
            status: "malformed",
            reason: `Provider-reported usage.cost is not an object: ${JSON.stringify(cost)}`,
        };
    }
    if (!("request_cost" in cost)) return { status: "absent" };
    const value = cost.request_cost;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        return {
            status: "malformed",
            reason: `Provider-reported request_cost is invalid: ${JSON.stringify(value) ?? String(value)}`,
        };
    }
    return { status: "present", value };
}

function isPerplexitySearchContextSize(
    value: unknown,
): value is PerplexitySearchContextSize {
    return value === "low" || value === "medium" || value === "high";
}

function getPerplexitySearchContextSizeFromOutput(
    output: unknown,
): PerplexitySearchContextSize | undefined {
    const o = output as PerplexityCostOutput | undefined;
    const events = o?.streamEvents ?? (o ? [o] : []);

    for (const event of [...events].reverse()) {
        const size = (event as PerplexityCostOutput | undefined)?.usage
            ?.search_context_size;
        if (isPerplexitySearchContextSize(size)) return size;
    }

    const requestSize = o?.billingRequest?.webSearchOptionsSearchContextSize;
    return isPerplexitySearchContextSize(requestSize) ? requestSize : undefined;
}

function getStaticPerplexityRequestCost(
    rule: BillingAdjustmentRule,
    output: unknown,
): number {
    const contextSize = getPerplexitySearchContextSizeFromOutput(output);
    if (!contextSize) return rule.unitCost;
    return rule.unitCostsBySearchContextSize?.[contextSize] ?? rule.unitCost;
}

function getPerplexityRequestCostWithFallback(
    rule: BillingAdjustmentRule,
    output: unknown,
): number {
    const fallbackCost = getStaticPerplexityRequestCost(rule, output);
    const o = output as PerplexityCostOutput | undefined;
    const events = o?.streamEvents ?? (o ? [o] : []);
    if (events.length === 0) return fallbackCost;

    for (const event of [...events].reverse()) {
        const read = readProviderRequestCostState(event);
        if (read.status === "absent") continue;
        if (read.status === "malformed") {
            console.error(
                `[registry] ${read.reason}; billing static Perplexity fallback ${fallbackCost}`,
            );
            return fallbackCost;
        }
        const maxReportedCost = fallbackCost * 10;
        if (read.value > maxReportedCost) {
            console.error(
                `[registry] Provider-reported request_cost ${read.value} exceeds 10x static Perplexity fallback ${fallbackCost}; billing fallback`,
            );
            return fallbackCost;
        }
        return read.value;
    }

    console.warn(
        `[registry] Provider-reported Perplexity request_cost missing; billing static fallback ${fallbackCost}`,
    );
    return fallbackCost;
}

function getBillingAdjustmentUnitCost(
    rule: BillingAdjustmentRule,
    output: unknown,
): number {
    if (rule.providerReportedUnitCost === "perplexityUsageCostRequest") {
        return getPerplexityRequestCostWithFallback(rule, output);
    }
    return rule.unitCost;
}

function selectBillingTier(
    svc: ModelDefinition,
    usage: Usage,
): BillingTierRule | undefined {
    const promptTokens = getPromptTokenCount(usage);
    return svc.billing?.tiers?.find(
        (tier) => promptTokens > tier.when.promptTokensGt,
    );
}

function getBillingCostDefinition(
    svc: ModelDefinition,
    usage: Usage,
): CostDefinition {
    const billingTier = selectBillingTier(svc, usage);
    return billingTier ? { ...svc.cost, ...billingTier.cost } : svc.cost;
}

function calculateBillingAdjustments(
    svc: ModelDefinition,
    output: unknown,
): BillingAdjustmentBreakdown[] {
    const adjustments: BillingAdjustmentBreakdown[] = [];
    for (const rule of svc.billing?.adjustments ?? []) {
        const units = countBillingAdjustmentUnits(rule.count, output);
        if ((rule.when ?? "grounded") !== "always" && units === 0) {
            continue;
        }
        const unitCost = getBillingAdjustmentUnitCost(rule, output);
        const priceMultiplier = rule.priceMultiplier ?? svc.priceMultiplier;
        const cost = units * unitCost;
        adjustments.push({
            ruleId: rule.id,
            kind: rule.kind,
            units,
            unitCost,
            cost,
            price: cost * priceMultiplier,
        });
    }
    return adjustments;
}

function sumAdjustmentCost(adjustments: BillingAdjustmentBreakdown[]): number {
    return adjustments.reduce(
        (total, adjustment) => total + adjustment.cost,
        0,
    );
}

function sumAdjustmentPrice(adjustments: BillingAdjustmentBreakdown[]): number {
    return adjustments.reduce(
        (total, adjustment) => total + adjustment.price,
        0,
    );
}

function calculateBillingAdjustmentCost(
    svc: ModelDefinition,
    output: unknown,
): number {
    return sumAdjustmentCost(calculateBillingAdjustments(svc, output));
}

function calculateBillingAdjustmentPrice(
    svc: ModelDefinition,
    output: unknown,
): number {
    return sumAdjustmentPrice(calculateBillingAdjustments(svc, output));
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
    const usageCost = calculateLinearCost(
        model,
        usage,
        getBillingCostDefinition(svc, usage),
    );
    const adjustmentCost = calculateBillingAdjustmentCost(svc, output);
    if (adjustmentCost === 0) return usageCost;
    return {
        ...usageCost,
        totalCost: usageCost.totalCost + adjustmentCost,
    };
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
    const usageCost = calculateLinearCost(
        model,
        usage,
        getBillingCostDefinition(svc, usage),
    );
    const usagePrice = Object.fromEntries(
        Object.entries(usageCost)
            .filter(([usageType]) => usageType !== "totalCost")
            .map(([usageType, cost]) => [
                usageType,
                (cost as number) * svc.priceMultiplier,
            ]),
    ) as Usage;
    const tokenTotalPrice = Object.values(usagePrice).reduce(
        (total, price) => total + price,
        0,
    );
    const adjustmentPrice = calculateBillingAdjustmentPrice(svc, output);
    return {
        ...usagePrice,
        totalPrice: roundPollenLedgerAmount(tokenTotalPrice + adjustmentPrice),
    };
}

export function calculateUsageBillingWithBreakdownForModelDefinition(
    model: string,
    usage: Usage,
    svc: ModelDefinition<string>,
    output?: unknown,
): UsageBillingWithAdjustments {
    const usageCost = calculateLinearCost(
        model,
        usage,
        getBillingCostDefinition(svc, usage),
    );
    const usagePrice = Object.fromEntries(
        Object.entries(usageCost)
            .filter(([usageType]) => usageType !== "totalCost")
            .map(([usageType, cost]) => [
                usageType,
                (cost as number) * svc.priceMultiplier,
            ]),
    ) as Usage;
    const tokenTotalPrice = Object.values(usagePrice).reduce(
        (total, price) => total + price,
        0,
    );
    const adjustments = calculateBillingAdjustments(svc, output);
    const adjustmentCost = sumAdjustmentCost(adjustments);
    const adjustmentPrice = sumAdjustmentPrice(adjustments);

    return {
        cost:
            adjustmentCost === 0
                ? usageCost
                : {
                      ...usageCost,
                      totalCost: usageCost.totalCost + adjustmentCost,
                  },
        price: {
            ...usagePrice,
            totalPrice: roundPollenLedgerAmount(
                tokenTotalPrice + adjustmentPrice,
            ),
        },
        adjustments,
    };
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
