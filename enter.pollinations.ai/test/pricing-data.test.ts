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
        expect(cost.totalCost).toBeGreaterThanOrEqual(
            (cost.completionReasoningTokens ?? 0) - 1e-9,
        );
        expect(price.totalPrice).toBeGreaterThanOrEqual(
            (price.completionReasoningTokens ?? 0) - 1e-9,
        );
    }
});

test("Claude Fable 5 is paid-only and billed at current standard rates", () => {
    const definition = getRegistryModelDefinition("claude-fable-5");

    expect(definition.paidOnly).toBe(true);
    expect(definition.priceMultiplier).toBe(1);
    expect(getCostDefinition("claude-fable-5")).toEqual({
        promptTextTokens: 0.00001,
        promptCachedTokens: 0.000001,
        promptCacheWriteTokens: 0.0000125,
        completionTextTokens: 0.00005,
    });
    expect(getPriceDefinition("claude-fable-5")).toEqual(
        getCostDefinition("claude-fable-5"),
    );
});

test("updated provider prices are reflected for xAI media and OpenRouter text", () => {
    expect(getCostDefinition("llama-scout").promptTextTokens).toBeCloseTo(
        0.0000001,
        12,
    );
    expect(getCostDefinition("step-3.5-flash").promptTextTokens).toBeCloseTo(
        0.0000001,
        12,
    );
    expect(getCostDefinition("mistral").promptCachedTokens).toBeCloseTo(
        0.000000015,
        12,
    );
    expect(
        getCostDefinition("qwen-coder-large").promptCachedTokens,
    ).toBeCloseTo(0.00000007, 12);
    expect(
        getCostDefinition("mistral-small-3.2").promptCachedTokens,
    ).toBeUndefined();
    expect(
        getCostDefinition("step-3.5-flash").promptCachedTokens,
    ).toBeUndefined();

    expect(
        calculateCost("grok-imagine", {
            promptImageTokens: 1,
            completionImageTokens: 1,
        }).totalCost,
    ).toBeCloseTo(0.022, 8);
    expect(
        calculateCost("grok-imagine-pro", {
            promptImageTokens: 1,
            completionImageTokens: 1,
        }).totalCost,
    ).toBeCloseTo(0.06, 8);
    expect(
        calculateCost("grok-video-pro", {
            promptImageTokens: 1,
            completionVideoSeconds: 5,
        }).totalCost,
    ).toBeCloseTo(0.352, 8);
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
    const openRouterSearchOutput = {
        usage: {
            server_tool_use_details: { web_search_requests: 2 },
        },
    };

    const geminiSearchCost = calculateCost(
        "gemini-search",
        usage,
        openRouterSearchOutput,
    );
    const geminiSearchPrice = calculatePrice(
        "gemini-search",
        usage,
        openRouterSearchOutput,
    );
    const gemini3FlashCost = calculateCost(
        "gemini-3-flash",
        usage,
        groundedOutput,
    );
    const geminiSearchFastCost = calculateCost(
        "gemini-search-fast",
        usage,
        openRouterSearchOutput,
    );
    const geminiSearchLargeCost = calculateCost(
        "gemini-search-large",
        usage,
        openRouterSearchOutput,
    );
    const ungroundedGeminiSearchFastCost = calculateCost(
        "gemini-search-fast",
        usage,
        { choices: [] },
    );

    // OpenRouter reports each native search request. priceMultiplier is 1×,
    // so price equals cost.
    expect(geminiSearchCost.totalCost).toBeCloseTo(0.528, 8);
    expect(geminiSearchPrice.totalPrice).toBeCloseTo(0.528, 8);

    // Gemini 3.x bills per non-empty search query.
    expect(gemini3FlashCost.totalCost).toBeCloseTo(3.528, 8);
    expect(geminiSearchFastCost.totalCost).toBeCloseTo(1.778, 8);
    expect(geminiSearchLargeCost.totalCost).toBeCloseTo(9.028, 8);
    expect(ungroundedGeminiSearchFastCost.totalCost).toBeCloseTo(1.75, 8);
});

// Billing internals are intentionally NOT exposed in the public /models schema
// (v1). Public model info carries only token pricing — assert the billing
// object is absent so a future re-exposure is a deliberate, tested change.
test("Gemini billing internals are not exposed in public model catalog", () => {
    const geminiSearchFast = getTextModelsInfo().find(
        (model) => model.name === "gemini-search-fast",
    );
    const geminiLarge = getTextModelsInfo().find(
        (model) => model.name === "gemini-large",
    );

    expect(geminiSearchFast).toBeDefined();
    expect(geminiLarge).toBeDefined();
    expect(geminiSearchFast).not.toHaveProperty("billing");
    expect(geminiLarge).not.toHaveProperty("billing");
});

test("Perplexity request search fees are added by declarative billing rules", () => {
    const usage = {
        promptTextTokens: 1_000_000,
        completionTextTokens: 1_000_000,
    };
    const cases = [
        ["perplexity-fast", 2.005],
        ["perplexity-high", 2.012],
        ["perplexity", 18.014],
        ["perplexity-reasoning", 10.014],
    ] as const;

    for (const [model, total] of cases) {
        const cost = calculateCost(model, usage);
        const price = calculatePrice(model, usage);

        expect(cost.totalCost).toBeCloseTo(total, 8);
        expect(price.totalPrice).toBeCloseTo(total, 8);
    }
});

test("Perplexity request search fee prefers provider-reported request cost", () => {
    const usage = {
        promptTextTokens: 1_000_000,
        completionTextTokens: 1_000_000,
    };
    const responseOutput = {
        usage: {
            cost: {
                request_cost: 0.006,
                total_cost: 0.0061,
            },
            search_context_size: "low",
        },
    };
    const streamOutput = {
        streamEvents: [
            { choices: [{ delta: { content: "ok" } }] },
            {
                usage: {
                    cost: {
                        request_cost: 0.012,
                    },
                },
                choices: [{ finish_reason: "stop" }],
            },
        ],
    };

    expect(
        calculateCost("perplexity-fast", usage, responseOutput).totalCost,
    ).toBeCloseTo(2.006, 8);
    expect(
        calculatePrice("perplexity-fast", usage, responseOutput).totalPrice,
    ).toBeCloseTo(2.006, 8);
    expect(
        calculateCost("perplexity-fast", usage, streamOutput).totalCost,
    ).toBeCloseTo(2.012, 8);
});

test("Perplexity provider-reported request cost clamps-and-alerts, never throws", () => {
    const usage = {
        promptTextTokens: 1_000_000,
        completionTextTokens: 1_000_000,
    };
    // perplexity-fast token cost = 2.0; static request fee = 0.005 → total 2.005.

    // Malformed cost data is NOT a request-failing fault: fall back to the
    // static registry fee (no throw) and alert.
    const malformed = [-0.5, Number.NaN, "0.005", null, { nested: true }];
    for (const requestCost of malformed) {
        const output = { usage: { cost: { request_cost: requestCost } } };
        expect(
            calculateCost("perplexity-fast", usage, output).totalCost,
        ).toBeCloseTo(2.005, 8);
        expect(
            calculatePrice("perplexity-fast", usage, output).totalPrice,
        ).toBeCloseTo(2.005, 8);
    }

    // A finite non-negative value within 10× the static fee is billed verbatim.
    const reasonable = { usage: { cost: { request_cost: 0.04 } } };
    expect(
        calculateCost("perplexity-fast", usage, reasonable).totalCost,
    ).toBeCloseTo(2.04, 8);

    // A value above 10× the static fee is clamped down to the static fee.
    const runaway = { usage: { cost: { request_cost: 9.99 } } };
    expect(
        calculateCost("perplexity-fast", usage, runaway).totalCost,
    ).toBeCloseTo(2.005, 8);

    // Absent cost data falls back to the static registry fee.
    expect(calculateCost("perplexity-fast", usage, {}).totalCost).toBeCloseTo(
        2.005,
        8,
    );
});

test("Gemini grounding is detected on streamed chunk output", () => {
    const usage = {
        promptTextTokens: 1_000_000,
        completionTextTokens: 1_000_000,
    };
    const openRouterStreamOutput = {
        streamEvents: [
            { choices: [{ delta: { content: "searching" } }] },
            {
                usage: {
                    server_tool_use_details: { web_search_requests: 2 },
                },
            },
        ],
    };

    // OpenRouter reports native search usage on the final stream event.
    expect(
        calculateCost("gemini-search", usage, openRouterStreamOutput).totalCost,
    ).toBeCloseTo(0.528, 8);
    expect(
        calculatePrice("gemini-search", usage, openRouterStreamOutput)
            .totalPrice,
    ).toBeCloseTo(0.528, 8);
    expect(
        calculateCost("gemini-search-fast", usage, openRouterStreamOutput)
            .totalCost,
    ).toBeCloseTo(1.778, 8);
});

// Billing rules live on the private ModelDefinition (drive the fee), but are
// NOT surfaced in the public /models schema. Assert both facts.
test("Perplexity billing rules carry per-tier request fees privately only", () => {
    const perplexityFees = [
        ["perplexity-fast", "perplexity.sonar_low.search_request.v1", 5 / 1000],
        [
            "perplexity-high",
            "perplexity.sonar_high.search_request.v1",
            12 / 1000,
        ],
        [
            "perplexity",
            "perplexity.sonar_pro_high.search_request.v1",
            14 / 1000,
        ],
        [
            "perplexity-reasoning",
            "perplexity.sonar_reasoning_high.search_request.v1",
            14 / 1000,
        ],
    ] as const;

    for (const [model, ruleId, unitCost] of perplexityFees) {
        const adjustment = getRegistryModelDefinition(model as ModelName)
            .billing?.adjustments?.[0];
        expect(adjustment).toMatchObject({
            id: ruleId,
            kind: "search_request",
            unit: "request",
            unitCost,
        });
        // Request fee applies to every request, independent of output content.
        expect(adjustment?.countUnits({})).toBe(1);
    }

    // Public catalog exposes token pricing only — no billing internals.
    for (const model of getTextModelsInfo()) {
        expect(model).not.toHaveProperty("billing");
    }
});

test("Gemini 3.x search query fee counts distinct queries and dedups chunks", () => {
    const usage = {
        promptTextTokens: 1_000_000,
        completionTextTokens: 1_000_000,
    };
    // gemini-3-flash token cost = 3.5; 3.x query fee = 0.014 per query.

    const zeroQueries = { choices: [{ groundingMetadata: {} }] };
    const oneQuery = {
        choices: [{ groundingMetadata: { webSearchQueries: ["berlin"] } }],
    };
    const threeQueries = {
        choices: [
            {
                groundingMetadata: {
                    webSearchQueries: ["a", "b", "c"],
                },
            },
        ],
    };
    // Cumulative stream chunks repeat the running query list — dedup to 3.
    const dupAcrossChunks = {
        streamEvents: [
            { choices: [{ groundingMetadata: { webSearchQueries: ["a"] } }] },
            {
                choices: [
                    { groundingMetadata: { webSearchQueries: ["a", "b"] } },
                ],
            },
            {
                choices: [
                    {
                        groundingMetadata: {
                            webSearchQueries: ["a", "b", "c"],
                        },
                    },
                ],
            },
        ],
    };

    expect(
        calculateCost("gemini-3-flash", usage, zeroQueries).totalCost,
    ).toBeCloseTo(3.5, 8);
    expect(
        calculateCost("gemini-3-flash", usage, oneQuery).totalCost,
    ).toBeCloseTo(3.514, 8);
    expect(
        calculateCost("gemini-3-flash", usage, threeQueries).totalCost,
    ).toBeCloseTo(3.542, 8);
    expect(
        calculateCost("gemini-3-flash", usage, dupAcrossChunks).totalCost,
    ).toBeCloseTo(3.542, 8);

    // Queries differing only in surrounding whitespace are the same query.
    const whitespaceDup = {
        choices: [
            { groundingMetadata: { webSearchQueries: ["berlin", " berlin "] } },
        ],
    };
    expect(
        calculateCost("gemini-3-flash", usage, whitespaceDup).totalCost,
    ).toBeCloseTo(3.514, 8);
});

test("Gemini counters never throw on malformed provider metadata", () => {
    const usage = {
        promptTextTokens: 1_000_000,
        completionTextTokens: 1_000_000,
    };
    // Counters run before the deduction/event path in track.ts — a throw
    // would skip billing AND tracking, so malformed shapes must bill
    // token-only instead of throwing.
    const malformed = [
        { choices: [{ groundingMetadata: { webSearchQueries: "berlin" } }] },
        { choices: [{ groundingMetadata: { webSearchQueries: [42, null] } }] },
        { choices: [{ groundingMetadata: { groundingChunks: "nope" } }] },
        { choices: [{ groundingMetadata: { groundingChunks: [null, 7] } }] },
        { choices: { groundingMetadata: {} } },
        { choices: [null, "text"] },
        { streamEvents: { choices: [] } },
        { streamEvents: [null, { choices: [null] }] },
    ];
    for (const output of malformed) {
        expect(
            calculateCost("gemini-3-flash", usage, output).totalCost,
        ).toBeCloseTo(3.5, 8);
        expect(
            calculateCost("gemini-search", usage, output).totalCost,
        ).toBeCloseTo(0.5, 8);
    }
});

test("Gemini models price cache writes at the standard input rate", () => {
    const models = [
        "gemini-3-flash",
        "gemini",
        "gemini-flash-lite-3.1",
        "gemini-fast",
        "gemini-large",
        "gemini-search",
        "gemini-search-fast",
        "gemini-search-large",
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

test("changed Gemini routes price separately reported video input tokens", () => {
    for (const model of [
        "gemini",
        "gemini-flash-lite-3.1",
        "gemini-fast",
        "gemini-search-fast",
        "gemini-search-large",
    ] as const) {
        const cost = getRegistryModelDefinition(model).cost;
        expect(
            cost.promptVideoTokens,
            `${model}.promptVideoTokens must match its input-token rate`,
        ).toBe(cost.promptTextTokens);
    }
});

test("bedrock nova models price cache writes free and reads at 25% of input", () => {
    // AWS Price List API (verified 2026-07-05): Nova cache writes are a $0
    // SKU; cache reads bill at 25% of the standard input rate.
    for (const model of ["nova", "nova-fast"] as const) {
        const cost = getRegistryModelDefinition(model).cost;
        expect(cost.promptCacheWriteTokens).toBe(0);
        expect(cost.promptCachedTokens).toBeCloseTo(
            (cost.promptTextTokens ?? 0) * 0.25,
            12,
        );
    }
});

test("vertex cache storage adjustment bills cache-creating requests", () => {
    // Flash-family storage: $1.00 / 1M token-hours, 1-hour TTL per create.
    const created = calculateBillingAdjustments(
        getRegistryModelDefinition("gemini-3-flash"),
        { usage: { cache_creation_input_tokens: 1_000_000 } },
        "gemini-3-flash",
    );
    expect(created).toEqual([
        {
            ruleId: "google.vertex.cache_storage.v1",
            kind: "cache_storage",
            unit: "token_hour",
            units: 1_000_000,
            unitCost: 0.000001,
            cost: 1.0,
            price: 1.0,
        },
    ]);

    // Stream responses carry usage on the final chunk.
    const streamed = calculateBillingAdjustments(
        getRegistryModelDefinition("gemini-3-flash"),
        {
            streamEvents: [
                { choices: [{}] },
                { usage: { cache_creation_input_tokens: 21500 } },
            ],
        },
        "gemini-3-flash",
    );
    expect(streamed).toHaveLength(1);
    expect(streamed[0].units).toBe(21500);
    expect(streamed[0].cost).toBeCloseTo(0.0215, 8);

    // Pro-family storage is $4.50 / 1M token-hours.
    const pro = calculateBillingAdjustments(
        getRegistryModelDefinition("gemini-large"),
        { usage: { cache_creation_input_tokens: 1_000_000 } },
        "gemini-large",
    );
    const proStorage = pro.find((a) => a.kind === "cache_storage");
    expect(proStorage?.cost).toBeCloseTo(4.5, 8);

    // Cache HITS report cached_tokens, not creation tokens → no storage fee.
    expect(
        calculateBillingAdjustments(
            getRegistryModelDefinition("gemini-fast"),
            {
                usage: { prompt_tokens_details: { cached_tokens: 21500 } },
            },
            "gemini-fast",
        ),
    ).toEqual([]);

    // Malformed values never bill or throw.
    for (const bad of [-5, "21500", null, true, {}]) {
        expect(
            calculateBillingAdjustments(
                getRegistryModelDefinition("gemini-fast"),
                { usage: { cache_creation_input_tokens: bad } },
                "gemini-fast",
            ),
        ).toEqual([]);
    }
});

test("OpenRouter Gemini adjustments use provider-reported cache and search usage", () => {
    const cacheWrite = calculateBillingAdjustments(
        getRegistryModelDefinition("gemini-fast"),
        {
            usage: {
                prompt_tokens_details: { cache_write_tokens: 1_000_000 },
            },
        },
        "gemini-fast",
    );
    expect(cacheWrite).toHaveLength(1);
    expect(cacheWrite[0]).toMatchObject({
        ruleId: "openrouter.google.cache_storage.v1",
        kind: "cache_storage",
        unit: "token_hour",
        units: 1_000_000,
    });
    expect(cacheWrite[0].unitCost).toBeCloseTo(1 / 12_000_000, 15);
    expect(cacheWrite[0].cost).toBeCloseTo(1 / 12, 15);
    expect(cacheWrite[0].price).toBeCloseTo(1 / 12, 15);

    const streamedSearch = calculateBillingAdjustments(
        getRegistryModelDefinition("gemini-search"),
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
        "gemini-search",
    );
    expect(streamedSearch).toEqual([
        {
            ruleId: "openrouter.google.web_search.v1",
            kind: "search_request",
            unit: "request",
            units: 2,
            unitCost: 0.014,
            cost: 0.028,
            price: 0.028,
        },
    ]);

    for (const bad of [-5, "2", null, true, {}]) {
        expect(
            calculateBillingAdjustments(
                getRegistryModelDefinition("gemini-search-fast"),
                {
                    usage: {
                        prompt_tokens_details: { cache_write_tokens: bad },
                        server_tool_use_details: {
                            web_search_requests: bad,
                        },
                    },
                },
                "gemini-search-fast",
            ),
        ).toEqual([]);
    }
});

test("calculateBillingAdjustments returns per-rule breakdown entries", () => {
    const gemini3 = calculateBillingAdjustments(
        getRegistryModelDefinition("gemini-3-flash"),
        {
            choices: [
                {
                    groundingMetadata: {
                        webSearchQueries: ["a", "b", "c"],
                    },
                },
            ],
        },
        "gemini-3-flash",
    );
    expect(gemini3).toEqual([
        {
            ruleId: "google.gemini_3.search_query.v1",
            kind: "search_query",
            unit: "query",
            units: 3,
            unitCost: 0.014,
            cost: 0.042,
            price: 0.042,
        },
    ]);

    const openRouterGeminiSearch = calculateBillingAdjustments(
        getRegistryModelDefinition("gemini-search"),
        {
            usage: {
                server_tool_use_details: { web_search_requests: 1 },
            },
        },
        "gemini-search",
    );
    expect(openRouterGeminiSearch).toEqual([
        {
            ruleId: "openrouter.google.web_search.v1",
            kind: "search_request",
            unit: "request",
            units: 1,
            unitCost: 0.014,
            cost: 0.014,
            price: 0.014,
        },
    ]);

    // Perplexity: request fee prefers provider-reported cost when present.
    const perplexity = calculateBillingAdjustments(
        getRegistryModelDefinition("perplexity-fast"),
        { usage: { cost: { request_cost: 0.006 } } },
        "perplexity-fast",
    );
    expect(perplexity).toEqual([
        {
            ruleId: "perplexity.sonar_low.search_request.v1",
            kind: "search_request",
            unit: "request",
            units: 1,
            unitCost: 0.006,
            cost: 0.006,
            price: 0.006,
        },
    ]);

    // No grounding evidence → no adjustment entries.
    expect(
        calculateBillingAdjustments(
            getRegistryModelDefinition("gemini-search"),
            {
                choices: [],
            },
            "gemini-search",
        ),
    ).toEqual([]);
});

// Versioned rule id, e.g. "google.gemini_3.search_query.v1". These strings key
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
        getRegistryModelDefinition("gemini-3-flash"),
        { choices: [{ groundingMetadata: { webSearchQueries: ["a", "b"] } }] },
        "gemini-3-flash",
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
