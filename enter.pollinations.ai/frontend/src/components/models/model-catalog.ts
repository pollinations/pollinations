import type { ModelInfo } from "@shared/registry/model-info.ts";
import {
    formatPrice,
    formatPriceFlat,
    formatPricePer1M,
} from "./formatters.ts";
import type { ModelCategory, ModelPrice, ModelPriceLine } from "./types.ts";
import type { ModelStats } from "./use-model-stats.ts";

type ApiPricing = ModelInfo["pricing"];

export type ApiModelInfo = Partial<ModelInfo> & {
    id?: string;
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

// A 200 response with an empty array, a non-array body, or entries that all
// lack an identifiable name/id is indistinguishable from "no models" to the
// caller — it must be treated as a fetch failure, not a valid empty catalog,
// so the UI surfaces an error instead of silently rendering an empty table.
export function parseModelCatalogResponse(data: unknown): ApiModelInfo[] {
    if (!Array.isArray(data) || data.length === 0) {
        throw new Error("Model catalog response was empty or malformed");
    }
    const models = data as ApiModelInfo[];
    if (!models.some((model) => getCatalogModelId(model))) {
        throw new Error("Model catalog response had no usable model entries");
    }
    return models;
}

let modelCatalogPromise: Promise<ApiModelInfo[]> | null = null;

export function mergeModelCatalogs(
    catalogs: readonly ApiModelInfo[][],
): ApiModelInfo[] {
    const modelsById = new Map<string, ApiModelInfo>();
    for (const catalog of catalogs) {
        for (const model of catalog) {
            const id = getCatalogModelId(model);
            if (id && !modelsById.has(id)) modelsById.set(id, model);
        }
    }
    return [...modelsById.values()];
}

// The official catalog is small and required — if it fails, the whole
// catalog fetch should fail loudly. Its own request should complete quickly.
const OFFICIAL_CATALOG_TIMEOUT_MS = 10_000;

// Community models make up the bulk of the payload (~250+ entries with full
// pricing metadata). They're fetched as a separate request so a slow/large
// community response can't hold up rendering official models, and so it can
// be given a more generous timeout without penalizing the common case.
const COMMUNITY_CATALOG_TIMEOUT_MS = 30_000;

async function fetchCatalog(
    url: string,
    { timeoutMs, cache }: { timeoutMs: number; cache: RequestCache },
): Promise<ApiModelInfo[]> {
    const response = await fetch(url, {
        cache,
        signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch models (${response.status})`);
    }
    return parseModelCatalogResponse(await response.json());
}

export async function fetchModelCatalog(
    options: { refresh?: boolean } = {},
): Promise<ApiModelInfo[]> {
    if (options.refresh) modelCatalogPromise = null;
    modelCatalogPromise ??= import("../../config.ts")
        .then(async ({ config }) => {
            // Previously this fetched one combined endpoint with
            // `cache: "no-store"`, forcing a full, uncached, ~250+ entry
            // payload on every dashboard visit and often approaching the
            // timeout on slower connections. Splitting official/community
            // apart and allowing the browser to reuse a fresh response
            // (rather than forcing revalidation every time) fixes both the
            // size and latency problems. An explicit refresh still bypasses
            // the cache so the "refresh" action reflects reality.
            const cache: RequestCache = options.refresh ? "reload" : "default";

            const officialCatalog = fetchCatalog(
                `${config.genBaseUrl}/models?community=false`,
                { timeoutMs: OFFICIAL_CATALOG_TIMEOUT_MS, cache },
            );

            const communityCatalog = fetchCatalog(
                config.communityCatalogUrl ??
                    `${config.genBaseUrl}/models?community=true`,
                { timeoutMs: COMMUNITY_CATALOG_TIMEOUT_MS, cache },
            ).catch((error) => {
                // Community models are supplementary: if that request is
                // slow, times out, or fails, degrade to official models
                // only rather than failing the whole catalog.
                console.warn("Failed to load community model catalog", error);
                return [] as ApiModelInfo[];
            });

            const catalogs = await Promise.all([
                officialCatalog,
                communityCatalog,
            ]);
            return mergeModelCatalogs(catalogs);
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
    const inputSortPrice = priceSum(model.pricing, INPUT_PRICE_FIELDS);
    const outputSortPrice = priceSum(model.pricing, OUTPUT_PRICE_FIELDS);

    return {
        name,
        type: getCatalogCategory(model),
        community: model.community,
        agent: model.agent,
        baseModel: model.base_model,
        perUserRpm: model.per_user_rpm,
        displayName: getCatalogDisplayName(model, name),
        description: getCatalogDescriptionWithoutName(model),
        brand: model.brand,
        brandUrl: model.brand_url,
        inputModalities: model.input_modalities,
        outputModalities: model.output_modalities,
        supportedEndpoints: model.supported_endpoints,
        capabilities: model.capabilities ?? [],
        paidOnly: model.paid_only,
        free:
            model.pricing !== undefined &&
            inputSortPrice === undefined &&
            outputSortPrice === undefined,
        alpha: model.alpha,
        addedDate: model.added_date,
        inputSortPrice,
        outputSortPrice,
        prices: [],
        priceAdjustments: model.pricing_adjustments,
        contextLength: model.context_length,
        minDuration: model.min_duration,
        maxDuration: model.max_duration,
        allowedDurations: model.allowed_durations
            ? [...model.allowed_durations]
            : undefined,
    };
}

function modelPriceFromPricing(model: ApiModelInfo): ModelPrice | null {
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

    if (price.type === "image") {
        const isFlatRate = model.flat_rate ?? !promptTextTokens;
        if (!isFlatRate) {
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
            prices: priceLines(
                [
                    "input",
                    "image",
                    formatPrice(promptImageTokens, formatPriceFlat),
                    "request",
                ],
                [
                    "output",
                    "image",
                    formatPrice(completionImageTokens, formatPriceFlat),
                    "request",
                ],
            ),
        };
    }

    if ((price.type as string) === "3d") {
        return {
            ...price,
            prices: priceLines([
                "output",
                "3d",
                formatPrice(completionImageTokens, formatPriceFlat),
                "request",
            ]),
        };
    }

    if (price.type === "realtime" && promptAudioSeconds) {
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

function modelPriceFromCatalog(model: ApiModelInfo): ModelPrice | null {
    const basePrice = modelPriceFromPricing(model);
    if (!basePrice) return null;

    const priceVariants = model.pricing_variants?.flatMap((variant) => {
        const variantPrice = modelPriceFromPricing({
            ...model,
            pricing: variant.pricing,
            pricing_variants: undefined,
        });
        return variantPrice
            ? [
                  {
                      name: variant.name,
                      label: variant.label,
                      description: variant.description,
                      prices: variantPrice.prices,
                  },
              ]
            : [];
    });

    return priceVariants?.length
        ? {
              ...basePrice,
              priceVariants,
              priceDefaultLabel: model.pricing_default_label,
          }
        : basePrice;
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
        if (!stats) return price;
        return {
            ...price,
            ...(stats.avgCost > 0 ? { realAvgCost: stats.avgCost } : {}),
            users7d: stats.userCount,
        };
    });
}
