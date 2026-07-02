import {
    formatPrice,
    formatPriceFlat,
    formatPricePer1M,
} from "./formatters.ts";
import type {
    ModelCapability,
    ModelCategory,
    ModelPrice,
    ModelPriceLine,
} from "./types.ts";
import type { ModelStats } from "./use-model-stats.ts";

type ApiPricing = Partial<Record<PriceField, string>> & {
    currency?: string;
};

export type ApiModelInfo = {
    name?: string;
    id?: string;
    category?: ModelCategory;
    brand?: string;
    community?: boolean;
    pricing?: ApiPricing;
    title?: string;
    description?: string;
    input_modalities?: string[];
    output_modalities?: string[];
    capabilities?: ModelCapability[];
    tools?: boolean;
    reasoning?: boolean;
    context_length?: number;
    voices?: string[];
    is_specialized?: boolean;
    paid_only?: boolean;
    alpha?: boolean;
    flat_rate?: boolean;
    added_date?: number;
};

type PriceField =
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

const INPUT_PRICE_FIELDS: PriceField[] = [
    "promptTextTokens",
    "promptCachedTokens",
    "promptCacheWriteTokens",
    "promptAudioTokens",
    "promptAudioSeconds",
    "promptImageTokens",
    "promptVideoTokens",
];

const OUTPUT_PRICE_FIELDS: PriceField[] = [
    "completionTextTokens",
    "completionReasoningTokens",
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

export async function fetchModelCatalog(
    options: { refresh?: boolean } = {},
): Promise<ApiModelInfo[]> {
    if (options.refresh) modelCatalogPromise = null;
    modelCatalogPromise ??= import("../../config.ts")
        .then(({ config }) =>
            fetch(`${config.genBaseUrl}/models`, { cache: "no-store" }),
        )
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
    model: ApiModelInfo,
    fallback: string,
): string =>
    model.title?.trim() ||
    model.description?.split(" - ")[0]?.trim() ||
    fallback;

export const getCatalogDescriptionWithoutName = (
    model: ApiModelInfo,
): string | undefined => {
    const { description } = model;
    if (!description) return undefined;
    const title = model.title?.trim();
    if (title && description.trim() === title) return undefined;
    const prefix = title ? `${title} - ` : "";
    if (prefix && description.startsWith(prefix)) {
        return description.slice(prefix.length).trim() || undefined;
    }
    const parts = description.split(" - ");
    return parts.length >= 2
        ? parts.slice(1).join(" - ").trim() || undefined
        : description;
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

type PriceLineInput = [
    ModelPriceLine["direction"],
    ModelPriceLine["kind"],
    string | undefined,
    ModelPriceLine["unit"],
];

const priceLines = (...lines: PriceLineInput[]): ModelPriceLine[] =>
    lines.flatMap(([direction, kind, price, unit]) =>
        price ? [{ direction, kind, price, unit }] : [],
    );

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
        community: model.community,
        displayName: getCatalogDisplayName(model, name),
        description: getCatalogDescriptionWithoutName(model),
        brand: model.brand,
        inputModalities: model.input_modalities,
        outputModalities: model.output_modalities,
        capabilities: model.capabilities ?? [],
        paidOnly: model.paid_only,
        alpha: model.alpha,
        addedDate: model.added_date,
        inputSortPrice: priceSum(model.pricing, INPUT_PRICE_FIELDS),
        outputSortPrice: priceSum(model.pricing, OUTPUT_PRICE_FIELDS),
        prices: [],
    };
}

function modelPriceFromCatalog(model: ApiModelInfo): ModelPrice | null {
    const price = baseModelPrice(model);
    if (!price) return null;

    const pricing = model.pricing;
    if (!pricing) return price;

    const promptTextTokens = priceNumber(pricing, "promptTextTokens");
    const promptCachedTokens = priceNumber(pricing, "promptCachedTokens");
    const promptCacheWriteTokens = priceNumber(
        pricing,
        "promptCacheWriteTokens",
    );
    const promptAudioTokens = priceNumber(pricing, "promptAudioTokens");
    const promptAudioSeconds = priceNumber(pricing, "promptAudioSeconds");
    const promptImageTokens = priceNumber(pricing, "promptImageTokens");
    const promptVideoTokens = priceNumber(pricing, "promptVideoTokens");
    const completionTextTokens = priceNumber(pricing, "completionTextTokens");
    const completionReasoningTokens = priceNumber(
        pricing,
        "completionReasoningTokens",
    );
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
                prices: priceLines([
                    "output",
                    "video",
                    formatPrice(completionVideoTokens, formatPricePer1M),
                    "token",
                ]),
            };
        }
        return {
            ...price,
            prices: priceLines(
                [
                    "output",
                    "video",
                    formatPrice(completionVideoSeconds, (v) => v.toFixed(3)),
                    "second",
                ],
                [
                    "output",
                    "audioOut",
                    formatPrice(completionAudioSeconds, (v) => v.toFixed(3)),
                    "second",
                ],
            ),
        };
    }

    // 3D generations are flat per-generation charges stored in
    // completionImageTokens (same convention as image models), so they render
    // through the image branch: no prompt-token prices → flat "/gen" line.
    if (price.type === "image" || price.type === "3d") {
        if (promptTextTokens || promptImageTokens) {
            return {
                ...price,
                prices: priceLines(
                    [
                        "input",
                        "text",
                        formatPrice(promptTextTokens, formatPricePer1M),
                        "token",
                    ],
                    [
                        "input",
                        "image",
                        formatPrice(promptImageTokens, formatPricePer1M),
                        "token",
                    ],
                    [
                        "output",
                        "image",
                        formatPrice(completionImageTokens, formatPricePer1M),
                        "token",
                    ],
                ),
            };
        }
        return {
            ...price,
            prices: priceLines([
                "output",
                "image",
                formatPrice(completionImageTokens, formatPriceFlat),
                "request",
            ]),
        };
    }

    if (price.type === "audio") {
        // Flat per-generation models (e.g. Stable Audio): one fee per request,
        // independent of length. Show flat "/gen" In/Out audio prices instead of
        // estimating a per-second rate. Both flat-fee music and per-character TTS
        // store their price in completionAudioTokens, so the registry flat_rate
        // flag is what tells them apart.
        if (model.flat_rate) {
            return {
                ...price,
                prices: priceLines(
                    [
                        "input",
                        "audioIn",
                        formatPrice(promptAudioTokens, formatPriceFlat),
                        "request",
                    ],
                    [
                        "output",
                        "audioOut",
                        formatPrice(completionAudioTokens, formatPriceFlat),
                        "request",
                    ],
                ),
            };
        }
        if (promptAudioSeconds) {
            return {
                ...price,
                prices: priceLines([
                    "input",
                    "audioIn",
                    formatPrice(promptAudioSeconds, (v) => v.toFixed(5)),
                    "second",
                ]),
            };
        }
        if (completionAudioSeconds) {
            return {
                ...price,
                prices: priceLines([
                    "output",
                    "audioOut",
                    formatPrice(completionAudioSeconds, (v) => v.toFixed(4)),
                    "second",
                ]),
            };
        }
        return {
            ...price,
            prices: priceLines([
                "output",
                "audioOut",
                formatPrice(
                    completionAudioTokens,
                    formatEstimatedTtsPricePerSecond,
                ),
                "second",
            ]),
        };
    }

    if (price.type === "embedding") {
        return {
            ...price,
            prices: priceLines(
                [
                    "input",
                    "text",
                    formatPrice(promptTextTokens, formatPricePer1M),
                    "token",
                ],
                [
                    "input",
                    "image",
                    formatPrice(promptImageTokens, formatPricePer1M),
                    "token",
                ],
                [
                    "input",
                    "audioIn",
                    formatPrice(promptAudioTokens, formatPricePer1M),
                    "token",
                ],
                [
                    "input",
                    "video",
                    formatPrice(promptVideoTokens, formatPricePer1M),
                    "token",
                ],
            ),
        };
    }

    return {
        ...price,
        prices: priceLines(
            [
                "input",
                "text",
                formatPrice(promptTextTokens, formatPricePer1M),
                "token",
            ],
            [
                "input",
                "cached",
                formatPrice(promptCachedTokens, formatPricePer1M),
                "token",
            ],
            [
                "input",
                "cacheWrite",
                formatPrice(promptCacheWriteTokens, formatPricePer1M),
                "token",
            ],
            [
                "input",
                "audioIn",
                formatPrice(promptAudioTokens, formatPricePer1M),
                "token",
            ],
            [
                "input",
                "image",
                formatPrice(promptImageTokens, formatPricePer1M),
                "token",
            ],
            [
                "output",
                "text",
                formatPrice(completionTextTokens, formatPricePer1M),
                "token",
            ],
            [
                "output",
                "reasoning",
                formatPrice(completionReasoningTokens, formatPricePer1M),
                "token",
            ],
            [
                "output",
                "audioOut",
                formatPrice(completionAudioTokens, formatPricePer1M),
                "token",
            ],
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
