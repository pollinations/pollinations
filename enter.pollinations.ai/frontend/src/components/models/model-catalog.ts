import { isCommunityProviderIconUrl } from "@shared/community-provider-icon.ts";
import type { ModelInfo } from "@shared/registry/model-info.ts";
import { formatPriceFlat, formatPricePer1M } from "./formatters.ts";
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
    | "promptVideoSeconds"
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
    "promptVideoSeconds",
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
let modelCatalogExpiresAt = 0;

async function fetchCatalog(url: string): Promise<ApiModelInfo[]> {
    const catalogUrl = new URL(url);
    // Keep the full accessible catalog so the search bar can offer status:all.
    catalogUrl.searchParams.set("reliability", "all");
    const response = await fetch(catalogUrl, {
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch models (${response.status})`);
    }
    return parseModelCatalogResponse(await response.json());
}

export async function fetchModelCatalog(
    options: { refresh?: boolean } = {},
): Promise<ApiModelInfo[]> {
    // Health changes over time; share requests without keeping a snapshot forever.
    if (options.refresh || Date.now() >= modelCatalogExpiresAt) {
        modelCatalogPromise = null;
        modelCatalogExpiresAt = Date.now() + 60_000;
    }
    modelCatalogPromise ??= import("../../config.ts")
        .then(({ config }) => fetchCatalog(`${config.genBaseUrl}/models`))
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

// Every billable field gets its own row, including mixed-modality models.
const PRICE_FIELDS: Record<
    PriceField,
    [ModelPriceLine["direction"], ModelPriceLine["kind"]]
> = {
    promptTextTokens: ["input", "text"],
    promptCachedTokens: ["input", "cached"],
    promptCacheWriteTokens: ["input", "cacheWrite"],
    promptAudioTokens: ["input", "audioIn"],
    promptAudioSeconds: ["input", "audioIn"],
    promptImageTokens: ["input", "image"],
    promptVideoTokens: ["input", "video"],
    promptVideoSeconds: ["input", "video"],
    completionTextTokens: ["output", "text"],
    completionReasoningTokens: ["output", "reasoning"],
    completionAudioTokens: ["output", "audioOut"],
    completionAudioSeconds: ["output", "audioOut"],
    completionImageTokens: ["output", "image"],
    completionVideoTokens: ["output", "video"],
    completionVideoSeconds: ["output", "video"],
};

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
        aliases: model.aliases,
        type: getCatalogCategory(model),
        community: model.community,
        health: model.health,
        agent: model.agent,
        baseModel: model.base_model,
        perUserRpm: model.per_user_rpm,
        displayName: getCatalogDisplayName(model, name),
        description: getCatalogDescriptionWithoutName(model),
        publisher: model.publisher,
        brandUrl: model.brand_url,
        brandIconUrl: isCommunityProviderIconUrl(model.brand_icon_url)
            ? model.brand_icon_url
            : undefined,
        inputModalities: model.input_modalities,
        outputModalities: model.output_modalities,
        supportedEndpoints: model.supported_endpoints,
        capabilities: model.capabilities ?? [],
        paidOnly: model.paid_only,
        // Agents may spend Pollen downstream even when their wrapper is free.
        free:
            !model.agent &&
            model.pricing !== undefined &&
            inputSortPrice === undefined &&
            outputSortPrice === undefined &&
            !model.pricing_adjustments?.some(
                ({ price }) => Number(price) > 0,
            ) &&
            !model.pricing_variants?.some(({ pricing }) =>
                [...INPUT_PRICE_FIELDS, ...OUTPUT_PRICE_FIELDS].some(
                    (field) => priceNumber(pricing, field) !== undefined,
                ),
            ),
        alpha: model.alpha,
        addedDate: model.added_date,
        retirementDate: model.retirement_date,
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

    const imageIsFlat =
        model.flat_rate ?? !priceNumber(pricing, "promptTextTokens");
    price.prices = (
        Object.entries(PRICE_FIELDS) as [
            PriceField,
            [ModelPriceLine["direction"], ModelPriceLine["kind"]],
        ][]
    ).flatMap(([field, [direction, kind]]) => {
        const rate = priceNumber(pricing, field);
        if (rate === undefined) return [];
        let unit: ModelPriceLine["unit"] = "token";
        let quantity = 1;
        if (field.endsWith("Seconds")) {
            unit = "second";
        } else if (
            field.endsWith("ImageTokens") &&
            ((price.type === "image" && imageIsFlat) ||
                price.type === "3d" ||
                (price.type === "video" &&
                    !priceNumber(pricing, "completionVideoTokens")))
        ) {
            unit = direction === "input" ? "image" : "request";
        } else if (price.type === "audio" && field.endsWith("AudioTokens")) {
            // TTS output is billed per input character; audio input stays in
            // tokens (e.g. transcription).
            unit = model.flat_rate
                ? "request"
                : field === "completionAudioTokens"
                  ? "character"
                  : "token";
        }
        const declared = model.pricing_units?.[field];
        if (declared) {
            unit = declared.unit;
            quantity = declared.quantity ?? 1;
        }
        const scaledRate = rate * quantity;
        const value =
            unit === "token"
                ? formatPricePer1M(scaledRate)
                : unit === "character" || unit === "byte"
                  ? formatPriceFlat(scaledRate * 1000)
                  : formatPriceFlat(scaledRate);
        return [
            {
                direction,
                kind: price.type === "3d" && kind === "image" ? "3d" : kind,
                price: value,
                unit,
            },
        ];
    });
    return price;
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
              pricingDimensions: model.pricing_dimensions,
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
