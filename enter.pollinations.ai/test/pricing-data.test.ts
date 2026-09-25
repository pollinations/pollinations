import { BotIcon, ChatIcon, ImageIcon } from "@pollinations/ui";
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
    ModelInfoSchema,
    modelInfoFromDefinition,
} from "@shared/registry/model-info.ts";
import {
    calculateBillingAdjustments,
    calculateCost,
    calculatePrice,
    getCostDefinition,
    getModels,
    getPriceDefinition,
    getRegistryModelDefinition,
    type ModelName,
} from "@shared/registry/registry.ts";
import { TEXT_SERVICES } from "@shared/registry/text.ts";
import { type ComponentProps, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { assert, expect, test } from "vitest";
import {
    formatDisplayPrice,
    formatPriceFlat,
    formatPricePer1M,
} from "../frontend/src/components/models/formatters.ts";
import { getModelPricesFromCatalog } from "../frontend/src/components/models/model-catalog.ts";
import { getCommunityModelIcon } from "../frontend/src/components/models/model-icons.tsx";
import {
    getFixedResolution,
    getModelBrandLogoPath,
    getModelCapabilities,
    getModelCapabilityLabel,
    hasPollinationsTools,
} from "../frontend/src/components/models/model-info.ts";
import { ModelRow } from "../frontend/src/components/models/model-row.tsx";
import { ModelHealthIndicator } from "../frontend/src/components/models/model-status-chips.tsx";
import {
    getPricingVariantControls,
    ModelPricingLedger,
} from "../frontend/src/components/models/price-badge.tsx";

const getCatalogModelPrices = () =>
    getModelPricesFromCatalog([
        ...getTextModelsInfo(),
        ...getImageModelsInfo(),
        ...getRealtimeModelsInfo(),
        ...getAudioModelsInfo(),
        ...getEmbeddingModelsInfo(),
        ...getModel3dModelsInfo(),
    ]);

test("health indicators show the current reliability sample", () => {
    for (const [status, label] of [
        [
            "healthy",
            "Healthy · 90% success · last 12 eligible requests · up to 7 days",
        ],
        [
            "degraded",
            "Degraded · 90% success · last 12 eligible requests · up to 7 days",
        ],
        [
            "down",
            "Down · 90% success · last 12 eligible requests · up to 7 days",
        ],
        ["unknown", "No data · last 7 days"],
    ] as const) {
        const markup = renderToStaticMarkup(
            createElement(ModelHealthIndicator, {
                communityProxy: true,
                health: {
                    status,
                    requests: status === "unknown" ? 0 : 12,
                    success_rate: status === "unknown" ? null : 90,
                },
            }),
        );
        expect(markup).toContain(`aria-label="${label}"`);
    }

    const official = renderToStaticMarkup(
        createElement(ModelHealthIndicator, {
            communityProxy: false,
            health: { status: "healthy", requests: 12, success_rate: 90 },
        }),
    );
    expect(official).toContain(
        'aria-label="Healthy · 90% success · last 24 hours"',
    );
});

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

test("display prices stay compact and use a readable token scale", () => {
    expect(formatDisplayPrice("2.0", true)).toEqual({
        value: "2",
        tokenScale: "M",
    });
    expect(formatDisplayPrice("120.0", true)).toEqual({
        value: "0.12",
        tokenScale: "K",
    });
    expect(formatDisplayPrice("0.083333333333")).toEqual({
        value: "0.0833",
        tokenScale: "M",
    });
    expect(formatDisplayPrice("0.00001")).toEqual({
        value: "0.00001",
        tokenScale: "M",
    });
    expect(formatDisplayPrice("0.00000778")).toEqual({
        value: "0.00000778",
        tokenScale: "M",
    });
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
        const imageUsesTokenRows = sourceModel?.flat_rate === false;
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

test("catalog distinguishes flat image rates from image-token rates", () => {
    const models = getCatalogModels();
    const prices = getCatalogModelPrices();
    const grokInfo = models.find(
        ({ name }) => name === "x-ai/grok-imagine-image",
    );
    const nanoInfo = models.find(
        ({ name }) => name === "google/gemini-3-pro-image",
    );
    const grokPrice = prices.find(
        ({ name }) => name === "x-ai/grok-imagine-image",
    );
    const nanoPrice = prices.find(
        ({ name }) => name === "google/gemini-3-pro-image",
    );

    expect(grokInfo?.flat_rate).toBe(true);
    expect(nanoInfo?.flat_rate).toBe(false);
    expect(grokPrice?.prices).toEqual([
        { direction: "input", kind: "image", price: "0.002", unit: "request" },
        { direction: "output", kind: "image", price: "0.02", unit: "request" },
    ]);
    expect(nanoPrice?.prices).toContainEqual({
        direction: "output",
        kind: "image",
        price: "126.6",
        unit: "token",
    });
});

test("catalog prices keep community text models flagged for display", () => {
    const [communityModel] = getModelPricesFromCatalog([
        {
            name: "voodoohop/openai",
            aliases: ["community/voodoohop/openai"],
            category: "text",
            community: true,
            publisher: "Example AI",
            brand_url: "https://example.com/",
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
        publisher: "Example AI",
        brandUrl: "https://example.com/",
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

test("Trellis 2 prices selectable resolution tiers", () => {
    const usage = { completionImageTokens: 1 };

    expect(calculateCost("microsoft/trellis-2", usage).totalCost).toBe(0.24);
    expect(
        calculateCost("microsoft/trellis-2", usage, undefined, {
            resolution: "medium",
        }).totalCost,
    ).toBe(0.29);
    expect(
        calculateCost("microsoft/trellis-2", usage, undefined, {
            resolution: "high",
        }).totalCost,
    ).toBe(0.35);
});

test("NVIDIA Asset Harvester flat rate pricing", () => {
    const usage = { completionImageTokens: 1 };

    expect(calculateCost("nvidia/asset-harvester", usage).totalCost).toBe(0.07);
});

test("catalog models resolve brand logo SVG assets", () => {
    const logoAssets = new Set(
        Object.keys(
            import.meta.glob("../frontend/public/brand-logos/*.svg"),
        ).map((file) => file.replace("../frontend/public", "")),
    );
    const missingLogos = getCatalogModelPrices().flatMap((model) => {
        const logoPath = getModelBrandLogoPath(model);
        return logoPath && logoAssets.has(logoPath)
            ? []
            : [{ name: model.name, publisher: model.publisher, logoPath }];
    });

    expect(missingLogos).toEqual([]);
});

test("community models use their model type icon instead of a provider logo", () => {
    const communityModel = {
        name: "owner/model",
        type: "text" as const,
        community: true,
        publisher: "Custom Provider",
        capabilities: [],
        prices: [],
    };

    expect(getModelBrandLogoPath(communityModel)).toBeUndefined();
    expect(getCommunityModelIcon(communityModel)).toBe(ChatIcon);
    expect(getCommunityModelIcon({ ...communityModel, type: "image" })).toBe(
        ImageIcon,
    );
    expect(getCommunityModelIcon({ ...communityModel, agent: true })).toBe(
        BotIcon,
    );
});

test("Pollinations tools are shown only for agents with the MCP capability", () => {
    const agent: ComponentProps<typeof ModelRow>["model"] = {
        name: "owner/agent",
        type: "text" as const,
        community: true,
        agent: true,
        capabilities: [],
        prices: [],
    };

    const toolsAgent = {
        ...agent,
        capabilities: ["pollinations_models" as const],
    };

    expect(hasPollinationsTools(agent)).toBe(false);
    expect(hasPollinationsTools(toolsAgent)).toBe(true);
    expect(
        renderToStaticMarkup(createElement(ModelRow, { model: agent })),
    ).not.toContain(">Tools</span>");
    expect(
        renderToStaticMarkup(createElement(ModelRow, { model: toolsAgent })),
    ).toContain(">Tools</span>");
});

test("tool calling is shown through the shared model capability display", () => {
    const model: ComponentProps<typeof ModelRow>["model"] = {
        name: "example/tools-model",
        type: "text",
        capabilities: ["tool_calling"],
        prices: [],
    };

    expect(getModelCapabilities(model)).toEqual(["tool_calling"]);
    expect(getModelCapabilityLabel(model)).toBe("Tool calling");
    expect(renderToStaticMarkup(createElement(ModelRow, { model }))).toContain(
        'aria-label="Tool calling"',
    );
});

test("cached modality adjustments remain visible without a matching base row", () => {
    const pricing: ComponentProps<typeof ModelPricingLedger>["pricing"] = {
        prices: [
            {
                direction: "input",
                kind: "cached",
                price: "0.06",
                unit: "token",
            },
        ],
        adjustments: [
            {
                name: "cached-audio-delta",
                label: "Cached audio input",
                kind: "cached_audio_input",
                price: "0.24",
                quantity: 1_000_000,
                unit: "tokens",
            },
        ],
        dropdowns: [],
    };
    const markup = renderToStaticMarkup(
        createElement(ModelPricingLedger, { pricing }),
    );

    expect(markup).toContain("Cached input");
    expect(markup).toContain("Cached audio input");
    expect(markup).toContain("0.24");
});

test.each([
    "left",
    "right",
] as const)("search fees render above normal rates with an icon and their billing unit (%s)", (align) => {
    const models = getCatalogModelPrices();
    for (const [kind, unit] of [
        ["search_query", "/K queries"],
        ["grounded_prompt", "/K prompts"],
        ["search_request", "/K req"],
    ]) {
        const model = models.find((item) =>
            item.priceAdjustments?.some(
                (fee) => fee.kind === kind && fee.quantity === 1_000,
            ),
        );
        assert(model);
        const markup = renderToStaticMarkup(
            createElement(ModelPricingLedger, {
                align,
                pricing: {
                    prices: model.prices,
                    adjustments: model.priceAdjustments ?? [],
                    dropdowns: [],
                },
            }),
        );
        const search = markup.indexOf(">Search<");
        const input = markup.indexOf(">Text in<");
        expect(search).toBeGreaterThan(-1);
        expect(input).toBeGreaterThan(search);
        expect(
            markup.slice(markup.lastIndexOf("<div", search), search),
        ).toContain("<svg");
        expect(markup.slice(search, input)).toContain(unit);
        expect(markup.slice(search, input)).toContain("border-t");
    }
});

test("flat fees join price options while token charges remain with normal rates", () => {
    const model = getCatalogModelPrices().find((item) =>
        item.priceAdjustments?.some((fee) => fee.label === "Execution fee"),
    );
    assert(model);
    const markup = renderToStaticMarkup(
        createElement(ModelPricingLedger, {
            pricing: {
                prices: model.prices,
                adjustments: model.priceAdjustments ?? [],
                dropdowns: [],
            },
        }),
    );
    const fee = markup.indexOf(">Execution fee<");
    expect(fee).toBeGreaterThan(-1);
    expect(markup.indexOf("border-t")).toBeGreaterThan(fee);
    expect(markup.indexOf(">Image out<")).toBeGreaterThan(
        markup.indexOf("border-t"),
    );

    const tokenOnly = renderToStaticMarkup(
        createElement(ModelPricingLedger, {
            pricing: {
                prices: [
                    {
                        direction: "input",
                        kind: "text",
                        price: "1",
                        unit: "token",
                    },
                ],
                adjustments: [
                    {
                        name: "cache",
                        label: "Cache storage",
                        kind: "cache_storage",
                        price: "0.1",
                        quantity: 1_000_000,
                        unit: "tokens written",
                    },
                ],
                dropdowns: [],
            },
        }),
    );
    expect(tokenOnly.indexOf(">Cache storage<")).toBeGreaterThan(
        tokenOnly.indexOf(">Text in<"),
    );
    expect(tokenOnly).not.toContain("border-t");
});

test("price selectors have a divider before normal rates even without extra fees", () => {
    const markup = renderToStaticMarkup(
        createElement(ModelPricingLedger, {
            pricing: {
                prices: [
                    {
                        direction: "input",
                        kind: "text",
                        price: "1",
                        unit: "token",
                    },
                ],
                adjustments: [],
                dropdowns: [
                    {
                        key: "context",
                        label: "Context",
                        unit: "tokens",
                        value: "base",
                        options: [{ value: "base", label: "≤32K" }],
                        onSelect: () => {},
                    },
                ],
            },
        }),
    );
    expect(markup.indexOf("border-t")).toBeGreaterThan(
        markup.indexOf(">Context<"),
    );
    expect(markup.indexOf(">Text in<")).toBeGreaterThan(
        markup.indexOf("border-t"),
    );
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
        if (model?.category !== "audio" && model?.category !== "realtime") {
            continue;
        }

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
        expect(cost.totalCost).toBeGreaterThanOrEqual(
            (cost.completionReasoningTokens ?? 0) - 1e-9,
        );
        expect(price.totalPrice).toBeGreaterThanOrEqual(
            (price.completionReasoningTokens ?? 0) - 1e-9,
        );
    }
});

test("Gemini Omni bills exact Vertex modality usage", () => {
    const model = "google/gemini-omni-1.1-flash";
    const usage = {
        promptTextTokens: 31,
        completionVideoTokens: 5_793,
        completionReasoningTokens: 276,
    };
    const cost = calculateCost(model, usage);

    expect(cost.totalCost).toBeCloseTo(
        31 * 0.0000015 + 5_793 * 0.0000175 + 276 * 0.000009,
        10,
    );
    expect(calculatePrice(model, usage).totalPrice).toBe(cost.totalCost);
});

test("Claude Fable 5 is paid-only and billed at current standard rates", () => {
    const definition = getRegistryModelDefinition("anthropic/claude-fable-5");

    expect(definition.paidOnly).toBe(true);
    expect(definition.priceMultiplier).toBe(1);
    expect(getCostDefinition("anthropic/claude-fable-5")).toEqual({
        promptTextTokens: 0.00001,
        promptCachedTokens: 0.000001,
        promptCacheWriteTokens: 0.0000125,
        completionTextTokens: 0.00005,
    });
    expect(getPriceDefinition("anthropic/claude-fable-5")).toEqual(
        getCostDefinition("anthropic/claude-fable-5"),
    );
});

test("Claude Fable 5.1 is paid-only and billed at current standard rates", () => {
    const definition = getRegistryModelDefinition("anthropic/claude-fable-5.1");

    expect(definition.paidOnly).toBe(true);
    expect(definition.priceMultiplier).toBe(1);
    expect(getCostDefinition("anthropic/claude-fable-5.1")).toEqual({
        promptTextTokens: 0.00001,
        promptCachedTokens: 0.00000025,
        promptCacheWriteTokens: 0.0000125,
        completionTextTokens: 0.00005,
    });
    expect(getPriceDefinition("anthropic/claude-fable-5.1")).toEqual(
        getCostDefinition("anthropic/claude-fable-5.1"),
    );
});

test("Qwen Image 3 uses Fal's output tier and reference-image rates", () => {
    expect(
        calculatePrice("qwen/qwen-image-3", {
            completionImageTokens: 1,
        }).totalPrice,
    ).toBeCloseTo(0.04, 8);
    expect(
        calculatePrice(
            "qwen/qwen-image-3",
            { completionImageTokens: 1 },
            undefined,
            { megapixels: (1536 * 1536) / 1_000_000 },
        ).totalPrice,
    ).toBeCloseTo(0.04, 8);
    expect(
        calculatePrice(
            "qwen/qwen-image-3",
            { completionImageTokens: 1 },
            undefined,
            { megapixels: 2.4 },
        ).totalPrice,
    ).toBeCloseTo(0.075, 8);
    expect(
        calculatePrice(
            "qwen/qwen-image-3",
            { promptImageTokens: 3, completionImageTokens: 1 },
            undefined,
            { megapixels: 4.194304 },
        ).totalPrice,
    ).toBeCloseTo(0.084, 8);
});

test("updated provider prices are reflected for xAI media and text routes", () => {
    expect(
        getCostDefinition("meta/llama-4-scout").promptTextTokens,
    ).toBeCloseTo(0.0000001, 12);
    expect(
        getCostDefinition("stepfun/step-3.5-flash").promptTextTokens,
    ).toBeCloseTo(0.0000001 * 1.055, 12);
    expect(
        getCostDefinition("mistralai/mistral-small-4").promptCachedTokens,
    ).toBeCloseTo(0.000000015, 12);
    expect(
        getCostDefinition("qwen/qwen3-coder-next").promptCachedTokens,
    ).toBeCloseTo(0.00000007 * 1.055, 12);
    expect(
        getCostDefinition("mistralai/mistral-small-3.2").promptCachedTokens,
    ).toBeUndefined();
    expect(
        getCostDefinition("stepfun/step-3.5-flash").promptCachedTokens,
    ).toBeUndefined();

    expect(
        calculateCost("x-ai/grok-imagine-image", {
            promptImageTokens: 1,
            completionImageTokens: 1,
        }).totalCost,
    ).toBeCloseTo(0.022, 8);
    expect(
        calculateCost("x-ai/grok-imagine-image-quality", {
            promptImageTokens: 1,
            completionImageTokens: 1,
        }).totalCost,
    ).toBeCloseTo(0.06 * 1.055, 8);
    for (const [quality, resolution, expected] of [
        ["low", "1k", 0.05],
        ["low", "2k", 0.07],
        ["medium", "1k", 0.07],
        ["medium", "2k", 0.09],
    ] as const) {
        expect(
            calculatePrice(
                "x-ai/grok-imagine-image-2.0",
                { promptImageTokens: 1, completionImageTokens: 1 },
                undefined,
                { quality, resolution },
            ).totalPrice,
        ).toBeCloseTo(expected * 1.055, 8);
    }
    expect(
        calculateCost("x-ai/grok-imagine-video", {
            promptImageTokens: 1,
            completionVideoSeconds: 5,
        }).totalCost,
    ).toBeCloseTo(0.352, 8);
    expect(
        calculateCost("x-ai/grok-imagine-video-1.5", {
            promptImageTokens: 1,
            completionVideoSeconds: 5,
        }).totalCost,
    ).toBeCloseTo(0.71 * 1.055, 8);
});

test("Gemini search cost follows each route's provider metadata", () => {
    const usage = {
        promptTextTokens: 1_000_000,
        completionTextTokens: 1_000_000,
    };
    const openRouterSearchOutput = {
        usage: {
            server_tool_use_details: { web_search_requests: 2 },
        },
    };
    const vertex3SearchOutput = {
        choices: [
            {
                groundingMetadata: {
                    webSearchQueries: ["query one", "query two"],
                },
            },
        ],
    };
    const vertex25SearchOutput = {
        choices: [
            {
                groundingMetadata: {
                    webSearchQueries: ["query one", "query two"],
                },
            },
        ],
    };
    const geminiSearchCost = calculateCost(
        "google/gemini-2.5-flash-lite:search",
        usage,
        vertex25SearchOutput,
    );
    const geminiSearchPrice = calculatePrice(
        "google/gemini-2.5-flash-lite:search",
        usage,
        vertex25SearchOutput,
    );
    const gemini3FlashCost = calculateCost(
        "google/gemini-3-flash-preview",
        usage,
        vertex3SearchOutput,
    );
    const geminiSearchFastCost = calculateCost(
        "google/gemini-3.5-flash-lite",
        usage,
        vertex3SearchOutput,
    );
    const geminiSearchLargeCost = calculateCost(
        "google/gemini-3.7-flash",
        usage,
        vertex3SearchOutput,
    );
    const gemini3FlashFallbackCost = calculateCost(
        "google/gemini-3-flash-preview:openrouter:vertex-global",
        usage,
        openRouterSearchOutput,
    );
    const ungroundedGeminiSearchFastCost = calculateCost(
        "google/gemini-3.5-flash-lite",
        usage,
        { choices: [] },
    );

    // Vertex 2.5 bills once per grounded prompt. priceMultiplier is 1×.
    expect(geminiSearchCost.totalCost).toBeCloseTo(0.535, 8);
    expect(geminiSearchPrice.totalPrice).toBeCloseTo(0.535, 8);

    // Direct Vertex costs exclude the public multiplier; OpenRouter fallback
    // costs include its 5.5% fee while keeping the same public quote.
    expect(gemini3FlashCost.totalCost).toBeCloseTo(3.528, 8);
    expect(geminiSearchFastCost.totalCost).toBeCloseTo(2.828, 8);
    expect(geminiSearchLargeCost.totalCost).toBeCloseTo(4.528, 8);
    expect(ungroundedGeminiSearchFastCost.totalCost).toBeCloseTo(2.8, 8);
    expect(gemini3FlashFallbackCost.totalCost).toBeCloseTo(3.528 * 1.055, 8);
});

test("public model catalog exposes Gemini billing prices without internals", () => {
    const geminiSearchFast = getTextModelsInfo().find(
        (model) => model.name === "google/gemini-3.5-flash-lite",
    );
    const geminiLarge = getTextModelsInfo().find(
        (model) => model.name === "google/gemini-3.1-pro-preview",
    );

    expect(geminiSearchFast).toBeDefined();
    expect(geminiLarge).toBeDefined();
    expect(geminiSearchFast).not.toHaveProperty("billing");
    expect(geminiLarge).not.toHaveProperty("billing");
    expect(geminiLarge?.pricing_adjustments).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                label: "Search",
                price: "14.77",
                currency: "pollen",
                quantity: 1_000,
                unit: "search queries",
            }),
        ]),
    );
});

test("Perplexity bills each web search it reports", () => {
    const usage = {
        promptTextTokens: 1_000_000,
        completionTextTokens: 1_000_000,
    };
    // $0.25 input and $2.50 output per 1M tokens, plus $2.50 per 1K searches.
    const tokenCost = 2.75;
    const cases: Array<[unknown, number]> = [
        [undefined, 0],
        [{}, 0],
        // A native Responses reply, and its streamed completion event.
        [
            {
                usage: {
                    tool_calls_details: { search_web: { invocation: 3 } },
                },
            },
            3,
        ],
        [
            {
                streamEvents: [
                    { type: "response.created" },
                    {
                        type: "response.completed",
                        response: {
                            usage: {
                                tool_calls_details: {
                                    search_web: { invocation: 2 },
                                },
                            },
                        },
                    },
                ],
            },
            2,
        ],
        // Chat replies carry the count in OpenRouter's usage field.
        [{ usage: { server_tool_use_details: { web_search_requests: 1 } } }, 1],
        [
            {
                streamEvents: [
                    { choices: [] },
                    {
                        usage: {
                            server_tool_use_details: { web_search_requests: 4 },
                        },
                    },
                ],
            },
            4,
        ],
        // A malformed count bills no search.
        [
            {
                usage: {
                    tool_calls_details: { search_web: { invocation: "2" } },
                },
            },
            0,
        ],
    ];

    for (const [output, searches] of cases) {
        const expected = tokenCost + searches * 0.0025;
        expect(
            calculateCost("perplexity/sonar", usage, output).totalCost,
        ).toBeCloseTo(expected, 8);
        expect(
            calculatePrice("perplexity/sonar", usage, output).totalPrice,
        ).toBeCloseTo(expected, 8);
    }
});

test("dedicated Vertex Gemini Search detects streamed grounding", () => {
    const usage = {
        promptTextTokens: 1_000_000,
        completionTextTokens: 1_000_000,
    };
    const vertexStreamOutput = {
        streamEvents: [
            { choices: [{ delta: { content: "searching" } }] },
            {
                choices: [
                    {
                        groundingMetadata: {
                            webSearchQueries: ["query one", "query two"],
                        },
                    },
                ],
            },
        ],
    };

    // Vertex reports grounding metadata on a streamed response event.
    expect(
        calculateCost(
            "google/gemini-2.5-flash-lite:search",
            usage,
            vertexStreamOutput,
        ).totalCost,
    ).toBeCloseTo(0.535, 8);
    expect(
        calculatePrice(
            "google/gemini-2.5-flash-lite:search",
            usage,
            vertexStreamOutput,
        ).totalPrice,
    ).toBeCloseTo(0.535, 8);
});

// Executable billing stays private; the public catalog receives only the
// display-safe price metadata asserted below.
test("Perplexity billing keeps executable rules private", () => {
    expect(
        getRegistryModelDefinition("perplexity/sonar").billing?.adjustments,
    ).toMatchObject([
        {
            id: "perplexity.web_search.v1",
            kind: "search_request",
            unit: "request",
            unitCost: 0.0025,
        },
    ]);

    // Public catalog exposes display-safe pricing, never executable billing.
    for (const model of getTextModelsInfo()) {
        expect(model).not.toHaveProperty("billing");
    }
});

test("every billing adjustment has public catalog metadata", () => {
    for (const model of getModels()) {
        const definition = getRegistryModelDefinition(model);
        const rules = definition.billing?.adjustments ?? [];
        const adjustments = modelInfoFromDefinition(
            model,
            definition,
        ).pricing_adjustments;

        expect(
            adjustments?.length ?? 0,
            `${model}: every billing rule must be publicly visible`,
        ).toBe(rules.length);

        for (const rule of rules) {
            expect(rule.publicPricing.label.trim()).not.toBe("");
            expect(rule.publicPricing.quantity).toBeGreaterThan(0);
            expect(rule.publicPricing.unit.trim()).not.toBe("");
            expect(
                Number(
                    adjustments?.find(({ name }) => name === rule.id)?.price,
                ),
            ).toBeCloseTo(
                rule.unitCost *
                    rule.publicPricing.quantity *
                    definition.priceMultiplier,
                10,
            );
        }
    }
});

test("Gemini models use their endpoint's advertised cache-write rate", () => {
    const models = [
        "google/gemini-3-flash-preview",
        "google/gemini-3.7-flash",
        "google/gemini-3.8-flash",
        "google/gemini-3.7-flash:openrouter:vertex-global",
        "google/gemini-3.5-flash-lite",
        "google/gemini-3.5-flash-lite:openrouter:vertex-global",
        "google/gemini-2.5-flash-lite",
        "google/gemini-3.1-pro-preview",
        "google/gemini-2.5-flash-lite:search",
    ] as const;
    for (const model of models) {
        // getRegistryModelDefinition throws on unknown names, so a renamed
        // model fails loudly instead of passing on undefined === undefined.
        const cost = getRegistryModelDefinition(model).cost;
        expect(
            cost?.promptCacheWriteTokens,
            `${model} promptCacheWriteTokens must equal its input rate`,
        ).toBeDefined();
        expect(cost?.promptCacheWriteTokens).toBe(cost?.promptTextTokens);
    }
});

test("Gemini routes price separately reported media input tokens", () => {
    for (const model of [
        "google/gemini-3-flash-preview",
        "google/gemini-3.7-flash",
        "google/gemini-3.8-flash",
        "google/gemini-3.5-flash-lite",
        "google/gemini-2.5-flash-lite",
        "google/gemini-3.1-pro-preview",
        "google/gemini-2.5-flash-lite:search",
    ] as const) {
        const cost = getRegistryModelDefinition(model).cost;
        expect(
            cost.promptImageTokens,
            `${model}.promptImageTokens must match its input-token rate`,
        ).toBe(cost.promptTextTokens);
        expect(
            cost.promptVideoTokens,
            `${model}.promptVideoTokens must match its input-token rate`,
        ).toBe(cost.promptTextTokens);
    }
});

test("Google text model providers match their configured routes", () => {
    const vertexModels = [
        "google/gemini-3-flash-preview",
        "google/gemini-3.7-flash",
        "google/gemini-3.8-flash",
        "google/gemini-3.5-flash-lite",
        "google/gemini-2.5-flash-lite",
        "google/gemini-3.1-pro-preview",
        "google/gemini-2.5-flash-lite:search",
    ] as const;
    const openRouterModels = [
        "google/gemini-3-flash-preview:openrouter:vertex-global",
        "google/gemini-3.7-flash:openrouter:vertex-global",
        "google/gemini-3.8-flash:openrouter:vertex-global",
        "google/gemini-3.5-flash-lite:openrouter:vertex-global",
        "google/gemini-2.5-flash-lite:openrouter:vertex-eu",
        "google/gemini-3.1-pro-preview:openrouter:vertex-global",
    ] as const;
    const publicModels = new Map(
        getTextModelsInfo().map((model) => [model.name, model]),
    );

    for (const model of openRouterModels) {
        const definition = getRegistryModelDefinition(model);
        expect(definition.provider, `${model} provider`).toBe("openrouter");
        expect(definition.codeExecution, `${model} code execution`).toBeFalsy();
        expect(definition.paidOnly, `${model} paid-only status`).toBe(true);
    }
    for (const model of vertexModels) {
        const definition = getRegistryModelDefinition(model);
        expect(definition.provider, `${model} provider`).toBe("google");
        expect(definition.codeExecution, `${model} code execution`).toBeFalsy();
        expect(
            publicModels.get(model)?.capabilities,
            `${model} public capabilities`,
        ).not.toContain("code_execution");
        expect(definition.paidOnly, `${model} paid-only status`).toBe(true);
    }
});

// Jev is the one exception: Quest Pollen must pay for it, and its $0.042/M
// input with free output bounds what a free-tier account can spend.
const OPENROUTER_FREE_TIER_MODELS = new Set(["typesafe/jev-1.13"]);

test("caller-selectable OpenRouter models require paid balance", () => {
    for (const model of getModels()) {
        const definition = getRegistryModelDefinition(model);
        if (
            definition.provider === "openrouter" &&
            definition.fallbackOnly !== true &&
            !OPENROUTER_FREE_TIER_MODELS.has(model)
        ) {
            expect(definition.paidOnly, `${model} paid-only status`).toBe(true);
        }
    }
});

test("MiniMax M2.7 uses the pinned Novita OpenRouter rates", () => {
    const definition = getRegistryModelDefinition("minimax/minimax-m2.7");

    expect(definition.provider).toBe("openrouter");
    expect(definition.paidOnly).toBe(true);
    expect(definition.priceMultiplier).toBe(1);
    expect(definition.cost).toMatchObject({
        promptTextTokens: (0.27 / 1e6) * 1.055,
        promptCachedTokens: (0.054 / 1e6) * 1.055,
        completionTextTokens: (1.08 / 1e6) * 1.055,
    });
});

test("Step Flash uses DeepInfra's standard and cached token rates", () => {
    const definition = getRegistryModelDefinition("stepfun/step-3.7-flash");

    expect(definition.provider).toBe("deepinfra");
    expect(definition.priceMultiplier).toBe(1);
    expect(definition.paidOnly).toBe(true);
    expect(definition.cost).toMatchObject({
        promptTextTokens: 0.2 / 1e6,
        promptCachedTokens: 0.04 / 1e6,
        completionTextTokens: 1.15 / 1e6,
    });
});

test("Pruna image models retain DeepInfra's flat per-image rates", () => {
    for (const [model, expectedCost] of [
        ["prunaai/p-image", 0.005],
        ["prunaai/p-image-edit", 0.01],
    ] as const) {
        const definition = getRegistryModelDefinition(model);

        expect(definition.provider, `${model} provider`).toBe("deepinfra");
        expect(definition.priceMultiplier, `${model} multiplier`).toBe(1);
        expect(definition.paidOnly, `${model} paid-only status`).toBe(true);
        expect(
            calculateCost(model, { completionImageTokens: 1 }).totalCost,
            `${model} one-image cost`,
        ).toBe(expectedCost);
    }
});

test("bedrock nova models price cache writes free and reads at 25% of input", () => {
    // AWS Price List API (verified 2026-07-05): Nova cache writes are a $0
    // SKU; cache reads bill at 25% of the standard input rate.
    for (const model of [
        "amazon/nova-2-lite-v1",
        "amazon/nova-micro-v1",
    ] as const) {
        const cost = getRegistryModelDefinition(model).cost;
        expect(cost.promptCacheWriteTokens).toBe(0);
        expect(cost.promptCachedTokens).toBeCloseTo(
            (cost.promptTextTokens ?? 0) * 0.25,
            12,
        );
    }
});

test("OpenRouter Gemini adjustments use provider-reported cache and search usage", () => {
    const flashLiteFallback =
        "google/gemini-2.5-flash-lite:openrouter:vertex-eu" as const;
    const cacheWrite = calculateBillingAdjustments(
        getRegistryModelDefinition(flashLiteFallback),
        {
            usage: {
                prompt_tokens_details: { cache_write_tokens: 1_000_000 },
            },
        },
        flashLiteFallback,
    );
    expect(cacheWrite).toHaveLength(1);
    expect(cacheWrite[0]).toMatchObject({
        ruleId: "openrouter.google.cache_storage.v1",
        kind: "cache_storage",
        unit: "token_hour",
        units: 1_000_000,
    });
    expect(cacheWrite[0].unitCost).toBeCloseTo((1 / 12_000_000) * 1.055, 15);
    expect(cacheWrite[0].cost).toBeCloseTo((1 / 12) * 1.055, 15);
    expect(cacheWrite[0].price).toBeCloseTo((1 / 12) * 1.055, 15);

    const proFallback =
        "google/gemini-3.1-pro-preview:openrouter:vertex-global" as const;
    const proCacheWrite = calculateBillingAdjustments(
        getRegistryModelDefinition(proFallback),
        {
            usage: {
                prompt_tokens_details: { cache_write_tokens: 1_000_000 },
            },
        },
        proFallback,
    );
    expect(proCacheWrite).toHaveLength(1);
    expect(proCacheWrite[0].unitCost).toBeCloseTo(
        (4.5 / 12_000_000) * 1.055,
        15,
    );
    expect(proCacheWrite[0].cost).toBeCloseTo(0.375 * 1.055, 15);

    const flashFallback =
        "google/gemini-3.7-flash:openrouter:vertex-global" as const;
    const geminiCacheWrite = calculateBillingAdjustments(
        getRegistryModelDefinition(flashFallback),
        {
            usage: {
                prompt_tokens_details: { cache_write_tokens: 1_000_000 },
            },
        },
        flashFallback,
    );
    expect(geminiCacheWrite).toHaveLength(1);
    expect(geminiCacheWrite[0].unitCost).toBeCloseTo(
        (0.5 / 12_000_000) * 1.055,
        15,
    );
    expect(geminiCacheWrite[0].cost).toBeCloseTo((0.5 / 12) * 1.055, 15);

    for (const model of [
        "google/gemini-3-flash-preview:openrouter:vertex-global",
        "google/gemini-3.5-flash-lite:openrouter:vertex-global",
        "google/gemini-2.5-flash-lite:openrouter:vertex-eu",
        "google/gemini-3.1-pro-preview:openrouter:vertex-global",
    ] as const) {
        expect(
            calculateBillingAdjustments(
                getRegistryModelDefinition(model),
                {
                    usage: {
                        server_tool_use_details: {
                            web_search_requests: 1,
                        },
                    },
                },
                model,
            ),
            `${model} reported web search fee`,
        ).toContainEqual({
            ruleId: "openrouter.google.web_search.v1",
            kind: "search_request",
            unit: "request",
            units: 1,
            unitCost: 0.014 * 1.055,
            cost: 0.014 * 1.055,
            price: 0.014 * 1.055,
        });
        expect(
            calculateBillingAdjustments(
                getRegistryModelDefinition(model),
                {},
                model,
            ),
            `${model} unused web search fee`,
        ).toEqual([]);
    }

    expect(
        calculateBillingAdjustments(
            getRegistryModelDefinition(flashFallback),
            {
                usage: {
                    server_tool_use_details: { web_search_requests: 1 },
                },
            },
            flashFallback,
        ),
    ).toContainEqual({
        ruleId: "openrouter.google.web_search.v1",
        kind: "search_request",
        unit: "request",
        units: 1,
        unitCost: 0.014 * 1.055,
        cost: 0.014 * 1.055,
        price: 0.014 * 1.055,
    });

    const streamedSearch = calculateBillingAdjustments(
        getRegistryModelDefinition(
            "google/gemini-3-flash-preview:openrouter:vertex-global",
        ),
        {
            streamEvents: [
                { choices: [{}] },
                {
                    usage: {
                        server_tool_use_details: { web_search_requests: 2 },
                    },
                },
            ],
        },
        "google/gemini-3-flash-preview:openrouter:vertex-global",
    );
    expect(streamedSearch).toEqual([
        {
            ruleId: "openrouter.google.web_search.v1",
            kind: "search_request",
            unit: "request",
            units: 2,
            unitCost: 0.014 * 1.055,
            cost: 0.028 * 1.055,
            price: 0.028 * 1.055,
        },
    ]);

    for (const bad of [-5, "2", null, true, {}]) {
        expect(
            calculateBillingAdjustments(
                getRegistryModelDefinition(flashLiteFallback),
                {
                    usage: {
                        prompt_tokens_details: { cache_write_tokens: bad },
                        server_tool_use_details: {
                            web_search_requests: bad,
                        },
                    },
                },
                flashLiteFallback,
            ),
        ).toEqual([]);
    }
});

test("Vertex Gemini Search adjustments use grounding metadata", () => {
    const model = "google/gemini-2.5-flash-lite:search";
    const groundedPrompt = calculateBillingAdjustments(
        getRegistryModelDefinition(model),
        {
            choices: [
                {
                    groundingMetadata: {
                        webSearchQueries: ["query one", "query two"],
                    },
                },
            ],
        },
        model,
    );
    expect(groundedPrompt).toEqual([
        {
            ruleId: "google.gemini_2.grounded_prompt.v1",
            kind: "grounded_prompt",
            unit: "prompt",
            units: 1,
            unitCost: 0.035,
            cost: 0.035,
            price: 0.035,
        },
    ]);

    const cacheWrite = calculateBillingAdjustments(
        getRegistryModelDefinition(model),
        {
            usage: { cache_creation_input_tokens: 1_000_000 },
        },
        model,
    );
    expect(cacheWrite).toEqual([
        {
            ruleId: "google.vertex.cache_storage.v1",
            kind: "cache_storage",
            unit: "token_hour",
            units: 1_000_000,
            unitCost: 0.000001,
            cost: 1,
            price: 1,
        },
    ]);
});

test("calculateBillingAdjustments returns per-rule breakdown entries", () => {
    const gemini3 = calculateBillingAdjustments(
        getRegistryModelDefinition("google/gemini-3-flash-preview"),
        {
            usage: {
                server_tool_use_details: { web_search_requests: 3 },
            },
        },
        "google/gemini-3-flash-preview",
    );
    expect(gemini3).toEqual([
        {
            ruleId: "google.gemini_3.search_query.v1",
            kind: "search_query",
            unit: "query",
            units: 3,
            unitCost: 0.014,
            cost: 0.042,
            price: 0.042 * 1.055,
        },
    ]);

    const vertexModel = "google/gemini-2.5-flash-lite:search";
    const vertexGeminiSearch = calculateBillingAdjustments(
        getRegistryModelDefinition(vertexModel),
        {
            choices: [
                {
                    groundingMetadata: {
                        webSearchQueries: ["current news"],
                    },
                },
            ],
        },
        vertexModel,
    );
    expect(vertexGeminiSearch).toEqual([
        {
            ruleId: "google.gemini_2.grounded_prompt.v1",
            kind: "grounded_prompt",
            unit: "prompt",
            units: 1,
            unitCost: 0.035,
            cost: 0.035,
            price: 0.035,
        },
    ]);

    // Perplexity: one fee per web search the provider reports.
    const perplexity = calculateBillingAdjustments(
        getRegistryModelDefinition("perplexity/sonar"),
        { usage: { tool_calls_details: { search_web: { invocation: 2 } } } },
        "perplexity/sonar",
    );
    expect(perplexity).toEqual([
        {
            ruleId: "perplexity.web_search.v1",
            kind: "search_request",
            unit: "request",
            units: 2,
            unitCost: 0.0025,
            cost: 0.005,
            price: 0.005,
        },
    ]);

    // No grounding evidence → no adjustment entries.
    expect(
        calculateBillingAdjustments(
            getRegistryModelDefinition(vertexModel),
            { choices: [] },
            vertexModel,
        ),
    ).toEqual([]);
});

// Versioned rule id, e.g. "openrouter.google.web_search.v1". These strings key
// the adjustment_costs / adjustment_units Map columns, so a typo silently
// splits a fee across two keys and corrupts revenue attribution. Guard the
// shape at the registry boundary.
const VERSIONED_RULE_ID = /^[a-z0-9_]+(\.[a-z0-9_]+)+\.v\d+$/;

test("every billing adjustment rule id matches the versioned pattern", () => {
    const offenders: string[] = [];
    for (const model of getModels()) {
        const rules =
            getRegistryModelDefinition(model as ModelName).billing
                ?.adjustments ?? [];
        for (const rule of rules) {
            if (!VERSIONED_RULE_ID.test(rule.id)) {
                offenders.push(`${model}: "${rule.id}"`);
            }
        }
    }
    expect(
        offenders,
        `Billing adjustment rule ids must match ${VERSIONED_RULE_ID}:\n${offenders.join("\n")}`,
    ).toEqual([]);
});

test("calculateBillingAdjustments only emits keys present in the breakdown", () => {
    // The event-storage reduce keys the Map columns off the breakdown's ruleIds;
    // assert every emitted breakdown entry carries a versioned rule id so the
    // drift guard above fully covers the keys that ever reach the datasource.
    const breakdown = calculateBillingAdjustments(
        getRegistryModelDefinition("google/gemini-3-flash-preview"),
        {
            usage: {
                server_tool_use_details: { web_search_requests: 2 },
            },
        },
        "google/gemini-3-flash-preview",
    );
    expect(breakdown.length).toBeGreaterThan(0);
    for (const entry of breakdown) {
        expect(entry.ruleId).toMatch(VERSIONED_RULE_ID);
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

test("pricing dimensions cover every public rate sheet through the catalog", () => {
    for (const catalogModel of getCatalogModels()) {
        if (!catalogModel.pricing_variants?.length) continue;
        const parsed = ModelInfoSchema.parse(catalogModel);
        const [model] = getModelPricesFromCatalog([parsed]);
        assert(model.priceVariants);
        assert(model.pricingDimensions);
        const variants = ["", ...model.priceVariants.map(({ name }) => name)];
        expect(model.pricingDimensions?.length, model.name).toBeGreaterThan(0);
        for (const dimension of model.pricingDimensions) {
            expect(Object.keys(dimension.values).sort(), model.name).toEqual(
                [...variants].sort(),
            );
            expect(
                Object.values(dimension.values).every(Boolean),
                model.name,
            ).toBe(true);
        }
        for (const variant of variants) {
            const controls = getPricingVariantControls(model, variant);
            for (const control of controls) {
                expect(
                    control.options.some(({ value }) => value === variant),
                    model.name,
                ).toBe(true);
                for (const option of control.options) {
                    expect(variants, model.name).toContain(option.value);
                }
            }
        }
    }
});

test("fixed resolution is omitted from metadata and price selectors", () => {
    const model = getCatalogModelPrices().find(
        ({ name }) => name === "bytedance/seedance-2.0",
    );
    assert(model);
    expect(getFixedResolution(model)).toBe("720p");
    for (const variant of ["", "video_in"]) {
        const controls = getPricingVariantControls(model, variant);
        expect(controls.map(({ key }) => key)).toEqual(["reference_video"]);
    }
    const markup = renderToStaticMarkup(createElement(ModelRow, { model }));
    expect(markup).not.toContain("Output resolution:");
    expect(markup).not.toContain("720p</span>");
    expect(markup).not.toContain(">Resolution<");
    expect(getFixedResolution({})).toBeUndefined();
});

test("resolution stays with pricing when another option leaves only one choice", () => {
    const model = getCatalogModelPrices().find(
        ({ name }) => name === "alibaba/wan-2.7",
    );
    assert(model?.pricingDimensions);
    // Put input first to exercise the dependent resolution control.
    const inputFirst = {
        ...model,
        pricingDimensions: [...model.pricingDimensions].reverse(),
    };
    expect(getFixedResolution(inputFirst)).toBeUndefined();
    const resolution = getPricingVariantControls(
        inputFirst,
        "1080p_image",
    ).find(({ key }) => key === "resolution");
    assert(resolution);
    expect(resolution.options.map(({ label }) => label)).toEqual(["1080p"]);
});

test("selectors and flat fees each have a dotted boundary before usage rates", () => {
    const markup = renderToStaticMarkup(
        createElement(ModelPricingLedger, {
            pricing: {
                prices: [
                    {
                        direction: "input",
                        kind: "text",
                        price: "1",
                        unit: "token",
                    },
                ],
                adjustments: [
                    {
                        name: "search",
                        label: "Search",
                        kind: "search_query",
                        price: "2",
                        quantity: 1_000,
                        unit: "search queries",
                    },
                ],
                dropdowns: [
                    {
                        key: "context",
                        label: "Context",
                        unit: "tokens",
                        value: "base",
                        options: [{ value: "base", label: "≤32K" }],
                        onSelect: () => {},
                    },
                ],
            },
        }),
    );
    const selectors = markup.indexOf(">Context<");
    const fees = markup.indexOf(">Search<");
    const rates = markup.indexOf(">Text in<");
    expect(selectors).toBeGreaterThan(-1);
    expect(fees).toBeGreaterThan(selectors);
    expect(rates).toBeGreaterThan(fees);
    expect(markup.slice(selectors, fees)).toContain("border-dotted");
    expect(markup.slice(fees, rates)).toContain("border-dotted");
    expect(markup.match(/border-dotted/g)).toHaveLength(2);
});

test("quality and resolution changes preserve the other pricing choice", () => {
    const model = getCatalogModelPrices().find(
        ({ name }) => name === "x-ai/grok-imagine-image-2.0",
    );
    assert(model);
    const choose = (variant: string, key: string, label: string) =>
        getPricingVariantControls(model, variant)
            .find((control) => control.key === key)
            ?.options.find((option) => option.label === label)?.value;
    expect(choose("low_2k", "quality", "Medium")).toBe("medium_2k");
    expect(choose("medium_2k", "resolution", "1K")).toBe("");
    expect(choose("", "quality", "Low")).toBe("low_1k");
});

test("dependent video choices select existing prices without impossible combinations", () => {
    const model = getCatalogModelPrices().find(
        ({ name }) => name === "alibaba/wan-2.7",
    );
    assert(model);
    const initial = getPricingVariantControls(model, "");
    expect(
        initial
            .find(({ key }) => key === "input")
            ?.options.map(({ label }) => label),
    ).toEqual(["Any"]);
    const resolution = initial.find(({ key }) => key === "resolution");
    assert(resolution);
    const highResolution = resolution.options.find(
        ({ label }) => label === "1080p",
    )?.value;
    assert(highResolution !== undefined);
    const input = getPricingVariantControls(model, highResolution).find(
        ({ key }) => key === "input",
    );
    assert(input);
    expect(input.options.map(({ label }) => label)).toEqual([
        "Text/video",
        "Image",
    ]);
    expect(input.options.find(({ label }) => label === "Image")?.value).toBe(
        "1080p_image",
    );
    expect(
        getPricingVariantControls(model, "1080p_image")[0].options.find(
            ({ label }) => label === "720p",
        )?.value,
    ).toBe("");
});

test("context changes preserve explicit cache selection and exact pricing ranges", () => {
    const model = getCatalogModelPrices().find(
        ({ name }) => name === "qwen/qwen3.7-flash",
    );
    assert(model);
    const context = getPricingVariantControls(model, "explicit_cache").find(
        ({ key }) => key === "context",
    );
    assert(context);
    expect(context.unit).toBe("tokens");
    expect(
        context.options.find(({ label }) => label === ">32K–256K")?.value,
    ).toBe("context_32k_explicit_cache");
    expect(context.options.find(({ label }) => label === ">256K")?.value).toBe(
        "context_256k_explicit_cache",
    );
});

test("transcription options preserve existing prompting and speaker prices", () => {
    const model = getCatalogModelPrices().find(
        ({ name }) => name === "assemblyai/universal-3.5-pro",
    );
    assert(model);
    const prompting = getPricingVariantControls(model, "diarization").find(
        ({ key }) => key === "prompting",
    );
    assert(prompting);
    expect(prompting.options.find(({ label }) => label === "On")?.value).toBe(
        "prompting_diarization",
    );
});

test("search pricing exposes separate row labels and values without changing legacy labels", () => {
    for (const model of getCatalogModels()) {
        for (const adjustment of model.pricing_adjustments ?? []) {
            if (adjustment.option?.group !== "search_context") continue;
            expect(adjustment.option.groupLabel).toBe("Search context");
            expect(adjustment.option.label).toBe(
                `${adjustment.option.valueLabel} search context`,
            );
        }
    }
});
