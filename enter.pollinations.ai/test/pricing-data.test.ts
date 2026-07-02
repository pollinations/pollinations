import { AUDIO_SERVICES } from "@shared/registry/audio.ts";
import { EMBEDDING_SERVICES } from "@shared/registry/embeddings.ts";
import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import {
    getAudioModelsInfo,
    getEmbeddingModelsInfo,
    getImageModelsInfo,
    getModel3dModelsInfo,
    getRealtimeModelsInfo,
    getTextModelsInfo,
} from "@shared/registry/model-info.ts";
import {
    calculateCost,
    calculatePrice,
    getCostDefinition,
    getModels,
    getPriceDefinition,
    getRegistryModelDefinition,
    type ModelName,
} from "@shared/registry/registry.ts";
import { TEXT_SERVICES } from "@shared/registry/text.ts";
import { expect, test } from "vitest";
import {
    formatPriceFlat,
    formatPricePer1M,
} from "../frontend/src/components/models/formatters.ts";
import { getModelPricesFromCatalog } from "../frontend/src/components/models/model-catalog.ts";
import { getModelBrandLogoPath } from "../frontend/src/components/models/model-info.ts";

const getCatalogModelPrices = () =>
    getModelPricesFromCatalog([
        ...getTextModelsInfo(),
        ...getImageModelsInfo(),
        ...getRealtimeModelsInfo(),
        ...getAudioModelsInfo(),
        ...getEmbeddingModelsInfo(),
        ...getModel3dModelsInfo(),
    ]);

const getCatalogModels = () => [
    ...getTextModelsInfo(),
    ...getImageModelsInfo(),
    ...getRealtimeModelsInfo(),
    ...getAudioModelsInfo(),
    ...getEmbeddingModelsInfo(),
    ...getModel3dModelsInfo(),
];

const tokenPriceRows = [
    { registryField: "promptTextTokens", direction: "input", kind: "text" },
    {
        registryField: "promptCachedTokens",
        direction: "input",
        kind: "cached",
    },
    {
        registryField: "promptCacheWriteTokens",
        direction: "input",
        kind: "cacheWrite",
    },
    {
        registryField: "promptAudioTokens",
        direction: "input",
        kind: "audioIn",
    },
    { registryField: "promptImageTokens", direction: "input", kind: "image" },
    {
        registryField: "completionTextTokens",
        direction: "output",
        kind: "text",
    },
    {
        registryField: "completionReasoningTokens",
        direction: "output",
        kind: "reasoning",
    },
    {
        registryField: "completionAudioTokens",
        direction: "output",
        kind: "audioOut",
    },
] as const;

const imageTokenPriceRows = [
    { registryField: "promptTextTokens", direction: "input", kind: "text" },
    { registryField: "promptImageTokens", direction: "input", kind: "image" },
    {
        registryField: "completionImageTokens",
        direction: "output",
        kind: "image",
    },
] as const;

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

test("catalog prices format token rates through formatPricePer1M", () => {
    const sourceByName = new Map(
        getCatalogModels().map((model) => [model.name, model]),
    );
    let checkedFields = 0;

    for (const modelPrice of getCatalogModelPrices()) {
        const sourceModel = sourceByName.get(modelPrice.name);
        if (
            sourceModel?.category === "audio" ||
            sourceModel?.category === "video"
        )
            continue;

        const pricing = sourceModel?.pricing;
        const imageUsesTokenRows =
            Number(pricing?.promptTextTokens) > 0 ||
            Number(pricing?.promptImageTokens) > 0;
        const rows =
            sourceModel?.category === "image"
                ? imageUsesTokenRows
                    ? imageTokenPriceRows
                    : []
                : tokenPriceRows;

        for (const { registryField, direction, kind } of rows) {
            const rawRate = Number(pricing?.[registryField]);
            if (!Number.isFinite(rawRate) || rawRate <= 0) continue;

            expect(modelPrice.prices).toContainEqual({
                direction,
                kind,
                price: formatPricePer1M(rawRate),
                unit: "token",
            });
            checkedFields += 1;
        }
    }

    expect(checkedFields).toBeGreaterThan(0);
});

test("catalog prices keep community text models flagged for display", () => {
    const [communityModel] = getModelPricesFromCatalog([
        {
            name: "voodoohop/openai",
            aliases: ["community/voodoohop/openai"],
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
        name: "voodoohop/openai",
        type: "text",
        community: true,
        displayName: "OpenAI relay",
        brand: "Community",
        capabilities: [],
    });
    expect(communityModel?.prices).toEqual(
        expect.arrayContaining([
            {
                direction: "input",
                kind: "text",
                price: "0.1",
                unit: "token",
            },
            {
                direction: "output",
                kind: "text",
                price: "0.2",
                unit: "token",
            },
        ]),
    );
    expect(communityModel.description).toBeUndefined();
});

test("catalog prices expose 3D flat output generation rates", () => {
    const sourceByName = new Map(
        getModel3dModelsInfo().map((model) => [model.name, model]),
    );
    const model3dPrices = getModelPricesFromCatalog(getModel3dModelsInfo());

    expect(model3dPrices.length).toBeGreaterThan(0);

    for (const modelPrice of model3dPrices) {
        const rawRate = Number(
            sourceByName.get(modelPrice.name)?.pricing.completionImageTokens,
        );

        expect(Number.isFinite(rawRate) && rawRate > 0).toBe(true);
        expect(modelPrice.prices).toContainEqual({
            direction: "output",
            kind: "3d",
            price: formatPriceFlat(rawRate),
            unit: "request",
        });
    }
});

test("catalog models resolve 3D brand logo SVG assets", () => {
    const model3dPrices = getModelPricesFromCatalog(getModel3dModelsInfo());
    const expectedLogoByBrand = new Map([
        ["Microsoft", "/brand-logos/microsoft.svg"],
        ["Deemos", "/brand-logos/deemos.svg"],
    ]);

    expect(model3dPrices.length).toBeGreaterThan(0);

    for (const modelPrice of model3dPrices) {
        expect(getModelBrandLogoPath(modelPrice)).toBe(
            expectedLogoByBrand.get(modelPrice.brand ?? ""),
        );
    }
});

test("model info exposes public capabilities without raw implementation flags", () => {
    let checkedCapabilities = 0;

    for (const model of getCatalogModels()) {
        const publicModel = model as Record<string, unknown>;
        const definition = getRegistryModelDefinition(model.name as ModelName);
        const expectedCapabilities = [
            definition.tools ? "tool_calling" : undefined,
            definition.reasoning ? "reasoning" : undefined,
            definition.search ? "web_search" : undefined,
            definition.codeExecution ? "code_execution" : undefined,
        ].filter((capability): capability is string => Boolean(capability));

        expect(publicModel.capabilities).toEqual(expectedCapabilities);
        expect(publicModel).not.toHaveProperty("search");
        expect(publicModel).not.toHaveProperty("codeExecution");
        expect(publicModel).not.toHaveProperty("code_execution");
        expect(publicModel).not.toHaveProperty("persona");

        checkedCapabilities += expectedCapabilities.length;
    }

    expect(checkedCapabilities).toBeGreaterThan(0);
});

test("catalog prices expose audio second rates from registry pricing", () => {
    const sourceByName = new Map(
        getCatalogModels().map((model) => [model.name, model]),
    );
    let checkedModels = 0;

    for (const modelPrice of getCatalogModelPrices()) {
        const model = sourceByName.get(modelPrice.name);
        if (model?.category !== "audio") continue;

        const promptAudioSeconds = Number(model.pricing.promptAudioSeconds);
        const completionAudioSeconds = Number(
            model.pricing.completionAudioSeconds,
        );
        const expectedRow =
            Number.isFinite(promptAudioSeconds) && promptAudioSeconds > 0
                ? {
                      direction: "input",
                      kind: "audioIn",
                      price: promptAudioSeconds.toFixed(5),
                      unit: "second",
                  }
                : Number.isFinite(completionAudioSeconds) &&
                    completionAudioSeconds > 0
                  ? {
                        direction: "output",
                        kind: "audioOut",
                        price: completionAudioSeconds.toFixed(4),
                        unit: "second",
                    }
                  : undefined;
        if (!expectedRow) continue;

        expect(modelPrice.prices).toContainEqual(expectedRow);
        checkedModels += 1;
    }

    expect(checkedModels).toBeGreaterThan(0);
});

test("reasoning token usage bills through completion text rates", () => {
    const modelsWithTextOutputRates = getModels().filter(
        (model) => getCostDefinition(model)?.completionTextTokens,
    );
    expect(modelsWithTextOutputRates.length).toBeGreaterThan(0);

    for (const model of modelsWithTextOutputRates) {
        const costDefinition = getCostDefinition(model);
        const priceDefinition = getPriceDefinition(model);
        if (!costDefinition?.completionTextTokens) continue;
        if (!priceDefinition?.completionTextTokens) continue;

        const usage = { completionReasoningTokens: 1_000_000 };
        const cost = calculateCost(model, usage);
        const price = calculatePrice(model, usage);

        expect(cost.completionReasoningTokens).toBeCloseTo(
            costDefinition.completionTextTokens *
                usage.completionReasoningTokens,
            8,
        );
        expect(price.completionReasoningTokens).toBeCloseTo(
            priceDefinition.completionTextTokens *
                usage.completionReasoningTokens,
            8,
        );
        expect(cost.totalCost).toBeCloseTo(
            cost.completionReasoningTokens ?? 0,
            8,
        );
        expect(price.totalPrice).toBeCloseTo(
            price.completionReasoningTokens ?? 0,
            8,
        );
    }
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
