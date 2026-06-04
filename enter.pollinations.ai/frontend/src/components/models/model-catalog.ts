import {
    formatPrice,
    formatPricePer1M,
    formatPricePerImage,
} from "./formatters.ts";
import type { ModelCategory, ModelPrice } from "./types.ts";
import type { ModelStats } from "./use-model-stats.ts";

type ApiPricing = Partial<Record<PriceField, string>> & {
    currency?: string;
};

export type ApiModelInfo = {
    name?: string;
    id?: string;
    category?: ModelCategory;
    brand?: string;
    pricing?: ApiPricing;
    description?: string;
    input_modalities?: string[];
    output_modalities?: string[];
    tools?: boolean;
    reasoning?: boolean;
    search?: boolean;
    code_execution?: boolean;
    context_length?: number;
    voices?: string[];
    is_specialized?: boolean;
    persona?: boolean;
    paid_only?: boolean;
    alpha?: boolean;
    added_date?: number;
};

type PriceField =
    | "promptTextTokens"
    | "promptCachedTokens"
    | "promptAudioTokens"
    | "promptAudioSeconds"
    | "promptImageTokens"
    | "promptVideoTokens"
    | "completionTextTokens"
    | "completionAudioTokens"
    | "completionAudioSeconds"
    | "completionImageTokens"
    | "completionVideoSeconds"
    | "completionVideoTokens";

const INPUT_PRICE_FIELDS: PriceField[] = [
    "promptTextTokens",
    "promptCachedTokens",
    "promptAudioTokens",
    "promptAudioSeconds",
    "promptImageTokens",
    "promptVideoTokens",
];

const OUTPUT_PRICE_FIELDS: PriceField[] = [
    "completionTextTokens",
    "completionAudioTokens",
    "completionAudioSeconds",
    "completionImageTokens",
    "completionVideoSeconds",
    "completionVideoTokens",
];

// Display-only conversion for char-billed TTS. Billing remains character-based;
// the pricing UI shows an estimated audio-second equivalent.
const ESTIMATED_TTS_CHARS_PER_SECOND = 15;

const formatEstimatedTtsPricePerSecond = (pricePerChar: number): string => {
    const pricePerSecond = pricePerChar * ESTIMATED_TTS_CHARS_PER_SECOND;
    return pricePerSecond < 0.001
        ? pricePerSecond.toFixed(5)
        : pricePerSecond.toFixed(4);
};

let modelCatalogPromise: Promise<ApiModelInfo[]> | null = null;

export async function fetchModelCatalog(): Promise<ApiModelInfo[]> {
    modelCatalogPromise ??= import("../../config.ts")
        .then(({ config }) => fetch(`${config.genBaseUrl}/models`))
        .then((response) => {
            if (!response.ok) {
                throw new Error(`Failed to fetch models (${response.status})`);
            }
            return response.json() as Promise<ApiModelInfo[]>;
        })
        .catch((error) => {
            modelCatalogPromise = null;
            throw error;
        });
    return modelCatalogPromise;
}

export const getCatalogModelId = (model: ApiModelInfo): string =>
    model.name || model.id || "";

export const getCatalogDisplayName = (
    description: string | undefined,
    fallback: string,
): string => description?.split(" - ")[0]?.trim() || fallback;

export const getCatalogDescriptionWithoutName = (
    description: string | undefined,
): string | undefined => {
    if (!description) return undefined;
    const parts = description.split(" - ");
    if (parts.length < 2) return undefined;
    return parts.slice(1).join(" - ").trim() || undefined;
};

function priceNumber(pricing: ApiPricing | undefined, field: PriceField) {
    const value = Number(pricing?.[field]);
    return Number.isFinite(value) && value > 0 ? value : undefined;
}

function priceSum(pricing: ApiPricing | undefined, fields: PriceField[]) {
    const total = fields.reduce(
        (sum, field) => sum + (priceNumber(pricing, field) ?? 0),
        0,
    );
    return total > 0 ? total : undefined;
}

export function getCatalogCategory(model: ApiModelInfo): ModelCategory {
    if (model.category) return model.category;
    const outputModalities = model.output_modalities ?? [];
    if (outputModalities.includes("video")) return "video";
    if (outputModalities.includes("image")) return "image";
    if (outputModalities.includes("audio")) return "audio";
    return "text";
}

function baseModelPrice(model: ApiModelInfo): ModelPrice | null {
    const name = getCatalogModelId(model);
    if (!name) return null;

    return {
        name,
        type: getCatalogCategory(model),
        displayName: getCatalogDisplayName(model.description, name),
        description: getCatalogDescriptionWithoutName(model.description),
        brand: model.brand,
        inputModalities: model.input_modalities,
        outputModalities: model.output_modalities,
        reasoning: model.reasoning,
        search: model.search,
        codeExecution: model.code_execution,
        persona: model.persona,
        paidOnly: model.paid_only,
        alpha: model.alpha,
        addedDate: model.added_date,
        inputSortPrice: priceSum(model.pricing, INPUT_PRICE_FIELDS),
        outputSortPrice: priceSum(model.pricing, OUTPUT_PRICE_FIELDS),
    };
}

function modelPriceFromCatalog(model: ApiModelInfo): ModelPrice | null {
    const price = baseModelPrice(model);
    if (!price) return null;

    const pricing = model.pricing;
    if (!pricing) return price;

    const promptTextTokens = priceNumber(pricing, "promptTextTokens");
    const promptCachedTokens = priceNumber(pricing, "promptCachedTokens");
    const promptAudioTokens = priceNumber(pricing, "promptAudioTokens");
    const promptAudioSeconds = priceNumber(pricing, "promptAudioSeconds");
    const promptImageTokens = priceNumber(pricing, "promptImageTokens");
    const promptVideoTokens = priceNumber(pricing, "promptVideoTokens");
    const completionTextTokens = priceNumber(pricing, "completionTextTokens");
    const completionAudioTokens = priceNumber(pricing, "completionAudioTokens");
    const completionAudioSeconds = priceNumber(
        pricing,
        "completionAudioSeconds",
    );
    const completionImageTokens = priceNumber(pricing, "completionImageTokens");
    const completionVideoSeconds = priceNumber(
        pricing,
        "completionVideoSeconds",
    );
    const completionVideoTokens = priceNumber(pricing, "completionVideoTokens");

    if (price.type === "video") {
        if (completionVideoTokens) {
            return {
                ...price,
                perToken: true,
                perTokenPrice: formatPrice(
                    completionVideoTokens,
                    formatPricePer1M,
                ),
            };
        }
        return {
            ...price,
            perToken: false,
            perSecondPrice: formatPrice(completionVideoSeconds, (v) =>
                v.toFixed(3),
            ),
            perAudioSecondPrice: formatPrice(completionAudioSeconds, (v) =>
                v.toFixed(3),
            ),
        };
    }

    if (price.type === "image") {
        if (promptTextTokens || promptImageTokens) {
            return {
                ...price,
                perToken: true,
                promptTextPrice: formatPrice(
                    promptTextTokens,
                    formatPricePer1M,
                ),
                promptImagePrice: formatPrice(
                    promptImageTokens,
                    formatPricePer1M,
                ),
                completionImagePrice: formatPrice(
                    completionImageTokens,
                    formatPricePer1M,
                ),
            };
        }
        return {
            ...price,
            perToken: false,
            perImagePrice: formatPrice(
                completionImageTokens,
                formatPricePerImage,
            ),
        };
    }

    if (price.type === "audio") {
        if (promptAudioSeconds) {
            return {
                ...price,
                perToken: false,
                perSecondPrice: formatPrice(promptAudioSeconds, (v) =>
                    v.toFixed(5),
                ),
            };
        }
        if (completionAudioSeconds) {
            return {
                ...price,
                perToken: false,
                perSecondPrice: formatPrice(completionAudioSeconds, (v) =>
                    v.toFixed(4),
                ),
            };
        }
        return {
            ...price,
            perToken: false,
            perSecondPrice: formatPrice(
                completionAudioTokens,
                formatEstimatedTtsPricePerSecond,
            ),
        };
    }

    if (price.type === "embedding") {
        return {
            ...price,
            perToken: true,
            promptTextPrice: formatPrice(promptTextTokens, formatPricePer1M),
            promptImagePrice: formatPrice(promptImageTokens, formatPricePer1M),
            promptAudioPrice: formatPrice(promptAudioTokens, formatPricePer1M),
            promptVideoPrice: formatPrice(promptVideoTokens, formatPricePer1M),
        };
    }

    return {
        ...price,
        perToken: true,
        promptTextPrice: formatPrice(promptTextTokens, formatPricePer1M),
        promptCachedPrice: formatPrice(promptCachedTokens, formatPricePer1M),
        promptAudioPrice: formatPrice(promptAudioTokens, formatPricePer1M),
        promptImagePrice: formatPrice(promptImageTokens, formatPricePer1M),
        completionTextPrice: formatPrice(
            completionTextTokens,
            formatPricePer1M,
        ),
        completionAudioPrice: formatPrice(
            completionAudioTokens,
            formatPricePer1M,
        ),
        completionAudioTokens: formatPrice(
            completionAudioTokens,
            formatPricePer1M,
        ),
    };
}

export function getModelPricesFromCatalog(
    models: ApiModelInfo[],
    modelStats?: ModelStats,
): ModelPrice[] {
    const prices = models
        .map(modelPriceFromCatalog)
        .filter((model): model is ModelPrice => Boolean(model));

    if (!modelStats) return prices;

    return prices.map((price) => {
        const stats = modelStats[price.name];
        return stats?.avgCost
            ? { ...price, realAvgCost: stats.avgCost }
            : price;
    });
}
