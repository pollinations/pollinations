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
    getPriceDefinition,
    getRegistryModelDefinition,
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

test("catalog prices keep community text models flagged for display", () => {
    const [communityModel] = getModelPricesFromCatalog([
        {
            name: "community/voodoohop/openai",
            category: "text",
            community: true,
            brand: "Community",
            title: "OpenAI relay",
            description: "OpenAI relay",
            pricing: {
                currency: "pollen",
                promptTextTokens: "0.0000001",
                completionTextTokens: "0.0000002",
            },
            input_modalities: ["text"],
            output_modalities: ["text"],
            capabilities: [],
        },
    ]);

    expect(communityModel).toMatchObject({
        name: "community/voodoohop/openai",
        type: "text",
        community: true,
        displayName: "OpenAI relay",
        brand: "Community",
        promptTextPrice: "0.1",
        completionTextPrice: "0.2",
        capabilities: [],
    });
    expect(communityModel.description).toBeUndefined();
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
    expect(
        getRegistryModelDefinition("universal-3-pro").paidOnly,
    ).toBeUndefined();

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

    const grok = getRegistryModelDefinition("grok");
    // `grok-large` now points at the newer Grok 4.3 (clean slug = newest);
    // the 4.20 reasoning model keeps the versioned slug `grok-4-20-reasoning`.
    const grokReasoning = getRegistryModelDefinition("grok-4-20-reasoning");

    for (const model of ["grok", "grok-4-20-reasoning"] as const) {
        const definition = getRegistryModelDefinition(model);
        const priceDefinition = getPriceDefinition(model);
        const usage =
            model === "grok-4-20-reasoning" ? reasoningUsage : inputUsage;
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

    expect(grokReasoning.modelId).toBe("grok-4-20-reasoning");
    expect(grokReasoning.reasoning).toBe(true);
    expect(
        calculateCost("grok-4-20-reasoning", reasoningUsage).totalCost,
    ).toBeCloseTo(16.2, 8);
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
