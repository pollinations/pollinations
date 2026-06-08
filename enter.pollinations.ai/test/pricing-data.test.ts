import { AUDIO_SERVICES } from "@shared/registry/audio.ts";
import { EMBEDDING_SERVICES } from "@shared/registry/embeddings.ts";
import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import {
    getAudioModelsInfo,
    getEmbeddingModelsInfo,
    getImageModelsInfo,
    getRealtimeModelsInfo,
    getTextModelsInfo,
} from "@shared/registry/model-info.ts";
import {
    calculateCost,
    calculatePrice,
    getModelDefinition,
    getPriceDefinition,
} from "@shared/registry/registry.ts";
import { TEXT_SERVICES } from "@shared/registry/text.ts";
import { expect, test } from "vitest";
import { formatPricePer1M } from "../frontend/src/components/models/formatters.ts";
import { getModelPricesFromCatalog } from "../frontend/src/components/models/model-catalog.ts";

const getCatalogModelPrices = () =>
    getModelPricesFromCatalog([
        ...getTextModelsInfo(),
        ...getImageModelsInfo(),
        ...getRealtimeModelsInfo(),
        ...getAudioModelsInfo(),
        ...getEmbeddingModelsInfo(),
    ]);

// Catalog pricing pipes every model rate through formatPricePer1M, so this file
// is the sole coverage of that formatter. Pin each decimal branch and the
// trailing-zero path directly against representative per-token inputs rather
// than whichever model happens to carry those rates today. The 1.5e-8 case
// guards the fixed IEEE-754 rounding bug where toFixed(2) collapsed
// 0.015 -> "0.01".
test("formatPricePer1M renders each decimal branch and strips trailing zeros", () => {
    expect(formatPricePer1M(2e-6)).toBe("2.0"); // >=1 -> 2 decimals, "2.00" -> "2.0"
    expect(formatPricePer1M(2e-7)).toBe("0.2"); // >=0.1 -> 3 decimals
    expect(formatPricePer1M(2e-8)).toBe("0.02"); // >=0.01 -> 4 decimals
    expect(formatPricePer1M(1.5e-8)).toBe("0.015"); // >=0.01 -> 4 decimals
    expect(formatPricePer1M(1.5e-9)).toBe("0.0015"); // <0.01 -> 5 decimals
});

test("catalog prices format text rates through formatPricePer1M", () => {
    const price = getPriceDefinition("gemini-fast");
    if (!price) throw new Error("gemini-fast price definition missing");

    const geminiFast = getCatalogModelPrices().find(
        (modelPrice) => modelPrice.name === "gemini-fast",
    );

    expect(geminiFast).toMatchObject({
        name: "gemini-fast",
        type: "text",
        promptTextPrice: formatPricePer1M(price.promptTextTokens ?? 0),
        promptCachedPrice: formatPricePer1M(price.promptCachedTokens ?? 0),
        promptAudioPrice: formatPricePer1M(price.promptAudioTokens ?? 0),
        completionTextPrice: formatPricePer1M(price.completionTextTokens ?? 0),
    });
});

test("model info exposes built-in model capabilities without raw implementation flags", () => {
    const geminiSearch = getTextModelsInfo().find(
        (model) => model.name === "gemini-search",
    ) as Record<string, unknown> | undefined;

    expect(geminiSearch).toMatchObject({
        capabilities: ["web_search", "code_execution"],
        tools: false,
    });
    expect(geminiSearch).not.toHaveProperty("search");
    expect(geminiSearch).not.toHaveProperty("code_execution");
    expect(geminiSearch).not.toHaveProperty("persona");
});

test("AssemblyAI STT pricing is exposed per input audio second", () => {
    const universal2 = getCatalogModelPrices().find(
        (price) => price.name === "universal-2",
    );
    const universal3Pro = getCatalogModelPrices().find(
        (price) => price.name === "universal-3-pro",
    );

    expect(universal2).toMatchObject({
        name: "universal-2",
        type: "audio",
        perSecondPrice: "0.00004",
    });
    expect(universal3Pro).toMatchObject({
        name: "universal-3-pro",
        type: "audio",
        perSecondPrice: "0.00006",
    });
    expect(getModelDefinition("universal-3-pro").paidOnly).toBeUndefined();

    expect(
        calculateCost("universal-2", { promptAudioSeconds: 3600 }).totalCost,
    ).toBeCloseTo(0.15, 8);
    expect(
        calculateCost("universal-3-pro", {
            promptAudioSeconds: 3600,
        }).totalCost,
    ).toBeCloseTo(0.21, 8);
});

test("Grok 4.20 registry metadata covers verified modalities and costs", () => {
    const inputUsage = {
        promptTextTokens: 1_000_000,
        promptCachedTokens: 1_000_000,
        promptImageTokens: 1_000_000,
        completionTextTokens: 1_000_000,
    };
    const reasoningUsage = {
        ...inputUsage,
        completionReasoningTokens: 1_000_000,
    };

    const grok = getModelDefinition("grok");
    const grokLarge = getModelDefinition("grok-large");

    for (const model of ["grok", "grok-large"] as const) {
        const definition = getModelDefinition(model);
        const priceDefinition = getPriceDefinition(model);
        const usage = model === "grok-large" ? reasoningUsage : inputUsage;
        const cost = calculateCost(model, usage);
        const price = calculatePrice(model, usage);

        expect(definition.provider).toBe("azure");
        expect(definition.brand).toBe("xAI");
        expect(definition.inputModalities).toEqual(["text", "image"]);
        expect(definition.outputModalities).toEqual(["text"]);
        expect(definition.tools).toBe(true);
        expect(definition.contextLength).toBe(262144);
        expect(priceDefinition?.promptTextTokens).toBeCloseTo(0.000002, 12);
        expect(priceDefinition?.promptCachedTokens).toBeCloseTo(0.0000002, 12);
        expect(priceDefinition?.promptImageTokens).toBeCloseTo(0.000002, 12);
        expect(priceDefinition?.completionTextTokens).toBeCloseTo(0.000006, 12);
        expect(price.totalPrice).toBeCloseTo(cost.totalCost, 8);
    }

    expect(grok.modelId).toBe("grok-4-20-non-reasoning");
    expect(grok.reasoning).toBeUndefined();
    expect(calculateCost("grok", inputUsage).totalCost).toBeCloseTo(10.2, 8);

    expect(grokLarge.modelId).toBe("grok-4-20-reasoning");
    expect(grokLarge.reasoning).toBe(true);
    expect(calculateCost("grok-large", reasoningUsage).totalCost).toBeCloseTo(
        16.2,
        8,
    );
});

test("Gemini grounding cost is added by family billing rules", () => {
    const usage = {
        promptTextTokens: 1_000_000,
        completionTextTokens: 1_000_000,
    };
    const groundedOutput = {
        choices: [
            {
                groundingMetadata: {
                    webSearchQueries: ["weather in Berlin", "Berlin forecast"],
                },
            },
        ],
    };

    const geminiSearchCost = calculateCost(
        "gemini-search",
        usage,
        groundedOutput,
    );
    const geminiSearchPrice = calculatePrice(
        "gemini-search",
        usage,
        groundedOutput,
    );
    const gemini3Cost = calculateCost("gemini", usage, groundedOutput);
    const geminiSearchFastCost = calculateCost(
        "gemini-search-fast",
        usage,
        groundedOutput,
    );
    const geminiSearchLargeCost = calculateCost(
        "gemini-search-large",
        usage,
        groundedOutput,
    );

    // Gemini 2.5 Search bills once per grounded prompt, not once per query.
    // priceMultiplier is 1×, so price equals cost.
    expect(geminiSearchCost.totalCost).toBeCloseTo(0.535, 8);
    expect(geminiSearchPrice.totalPrice).toBeCloseTo(0.535, 8);

    // Gemini 3.x bills per non-empty search query.
    expect(gemini3Cost.totalCost).toBeCloseTo(3.528, 8);
    expect(geminiSearchFastCost.totalCost).toBeCloseTo(1.778, 8);
    expect(geminiSearchLargeCost.totalCost).toBeCloseTo(10.528, 8);
});

test("Gemini billing policies are exposed in model catalog metadata", () => {
    const geminiSearchFast = getTextModelsInfo().find(
        (model) => model.name === "gemini-search-fast",
    );
    const geminiLarge = getTextModelsInfo().find(
        (model) => model.name === "gemini-large",
    );

    expect(geminiSearchFast?.billing_policy).toMatchObject({
        id: "google.gemini_3.search_query.v1",
        description:
            "Adds Google Search grounding at $14 / 1K search queries when grounding metadata is present.",
    });
    expect(geminiLarge?.billing_policy?.description).toContain(
        "Uses Gemini long-context rates above 200K prompt tokens",
    );
});

test("Gemini 3.1 Pro uses long-context rates above 200k prompt tokens", () => {
    const shortContextCost = calculateCost("gemini-large", {
        promptTextTokens: 200_000,
        completionTextTokens: 1_000,
    });
    const longContextCost = calculateCost("gemini-large", {
        promptTextTokens: 200_001,
        completionTextTokens: 1_000,
    });
    const longContextPrice = calculatePrice("gemini-large", {
        promptTextTokens: 200_001,
        completionTextTokens: 1_000,
    });

    // priceMultiplier is 1×, so price equals cost.
    expect(shortContextCost.totalCost).toBeCloseTo(0.412, 8);
    expect(longContextCost.totalCost).toBeCloseTo(0.818004, 8);
    expect(longContextPrice.totalPrice).toBeCloseTo(0.818004, 8);
});

test("registry cost blocks contain no sentinel/placeholder negative values", () => {
    const registries = [
        ["text", TEXT_SERVICES],
        ["image", IMAGE_SERVICES],
        ["audio", AUDIO_SERVICES],
        ["embeddings", EMBEDDING_SERVICES],
    ] as const;

    const offenders: string[] = [];
    for (const [kind, services] of registries) {
        for (const [name, def] of Object.entries(services)) {
            const cost = (def as { cost?: Record<string, number> }).cost;
            if (!cost) continue;
            for (const [field, value] of Object.entries(cost)) {
                if (typeof value === "number" && value < 0) {
                    offenders.push(`${kind}/${name}.cost.${field}=${value}`);
                }
            }
        }
    }

    expect(
        offenders,
        `Models with placeholder/sentinel pricing — fill in real rates before merging:\n${offenders.join("\n")}`,
    ).toEqual([]);
});
