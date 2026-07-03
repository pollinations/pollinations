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
    const gemini3FlashCost = calculateCost(
        "gemini-3-flash",
        usage,
        groundedOutput,
    );
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
    const ungroundedGeminiSearchFastCost = calculateCost(
        "gemini-search-fast",
        usage,
        { choices: [] },
    );

    // Gemini 2.5 Search bills once per grounded prompt, not once per query.
    // priceMultiplier is 1×, so price equals cost.
    expect(geminiSearchCost.totalCost).toBeCloseTo(0.535, 8);
    expect(geminiSearchPrice.totalPrice).toBeCloseTo(0.535, 8);

    // Gemini 3.x bills per non-empty search query.
    expect(gemini3FlashCost.totalCost).toBeCloseTo(3.528, 8);
    expect(geminiSearchFastCost.totalCost).toBeCloseTo(1.778, 8);
    expect(geminiSearchLargeCost.totalCost).toBeCloseTo(10.528, 8);
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
        ["perplexity-deep", 2.012],
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
    const streamOutput = {
        streamEvents: [
            { choices: [{ delta: { content: "searching" } }] },
            {
                choices: [
                    {
                        groundingMetadata: {
                            webSearchQueries: [
                                "weather in Berlin",
                                "Berlin forecast",
                            ],
                        },
                    },
                ],
            },
        ],
    };

    // Same totals as the non-stream fixtures: grounding billed once per
    // prompt for Gemini 2.5, per unique query for Gemini 3.x.
    expect(
        calculateCost("gemini-search", usage, streamOutput).totalCost,
    ).toBeCloseTo(0.535, 8);
    expect(
        calculatePrice("gemini-search", usage, streamOutput).totalPrice,
    ).toBeCloseTo(0.535, 8);
    expect(
        calculateCost("gemini-search-fast", usage, streamOutput).totalCost,
    ).toBeCloseTo(1.778, 8);
});

// Billing rules live on the private ModelDefinition (drive the fee), but are
// NOT surfaced in the public /models schema. Assert both facts.
test("Perplexity billing rules carry per-tier request fees privately only", () => {
    const perplexityFees = [
        ["perplexity-fast", "perplexity.sonar_low.search_request.v1", 5 / 1000],
        [
            "perplexity-deep",
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
            count: "perplexityRequest",
            when: "always",
            unitCost,
        });
    }

    // Public catalog exposes token pricing only — no billing internals.
    for (const model of getTextModelsInfo()) {
        expect(model).not.toHaveProperty("billing");
    }
});

test("Gemini 2.5 grounded prompt is billed on web chunks even without queries", () => {
    const usage = {
        promptTextTokens: 1_000_000,
        completionTextTokens: 1_000_000,
    };
    // gemini-search token cost = 0.5; 2.5 grounded prompt fee = 0.035.

    // webSearchQueries empty, but web grounding chunks present → still 1 prompt.
    const chunksOnly = {
        choices: [
            {
                groundingMetadata: {
                    webSearchQueries: [],
                    groundingChunks: [
                        { web: { uri: "https://example.test/a" } },
                    ],
                },
            },
        ],
    };
    expect(
        calculateCost("gemini-search", usage, chunksOnly).totalCost,
    ).toBeCloseTo(0.535, 8);

    // groundingSupports alone (no queries, no web chunks) is NOT billable
    // evidence — Vertex-AI-Search grounding also emits supports, and only
    // Google-Search web evidence carries the grounded-prompt fee.
    const supportsOnly = {
        choices: [
            {
                groundingMetadata: {
                    groundingSupports: [{ segment: { startIndex: 0 } }],
                },
            },
        ],
    };
    expect(
        calculateCost("gemini-search", usage, supportsOnly).totalCost,
    ).toBeCloseTo(0.5, 8);
});

test("Gemini 2.5 retrievalQueries-only response is not billed as grounded", () => {
    const usage = {
        promptTextTokens: 1_000_000,
        completionTextTokens: 1_000_000,
    };
    // Vertex-AI-Search (retrievalQueries) is a different product — no
    // Google-Search grounded-prompt fee. Empty web chunks must also not count.
    // Includes groundingSupports: a real Vertex-AI-Search response annotates
    // answer spans too, and that must not trigger the Google-Search fee.
    const retrievalOnly = {
        choices: [
            {
                groundingMetadata: {
                    retrievalQueries: ["internal doc lookup"],
                    groundingChunks: [
                        { retrievedContext: { uri: "gs://corpus/doc" } },
                    ],
                    groundingSupports: [{ segment: { startIndex: 0 } }],
                },
            },
        ],
    };
    const noGrounding = { choices: [{ groundingMetadata: {} }] };

    expect(
        calculateCost("gemini-search", usage, retrievalOnly).totalCost,
    ).toBeCloseTo(0.5, 8);
    expect(
        calculateCost("gemini-search", usage, noGrounding).totalCost,
    ).toBeCloseTo(0.5, 8);
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

    const gemini25 = calculateBillingAdjustments(
        getRegistryModelDefinition("gemini-search"),
        {
            choices: [
                {
                    groundingMetadata: {
                        groundingChunks: [
                            { web: { uri: "https://example.test/a" } },
                        ],
                    },
                },
            ],
        },
    );
    expect(gemini25).toEqual([
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

    // Perplexity: request fee prefers provider-reported cost when present.
    const perplexity = calculateBillingAdjustments(
        getRegistryModelDefinition("perplexity-fast"),
        { usage: { cost: { request_cost: 0.006 } } },
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
        ),
    ).toEqual([]);
});

test("every model with billing adjustments uses priceMultiplier === 1", () => {
    // Adjustment cost doubles as adjustment price in event storage (price ==
    // cost × priceMultiplier, and there is no separate adjustment_price column
    // yet). A model that carries adjustment rules AND marks up its multiplier
    // would silently break component-level revenue attribution. Fail loud here;
    // revisit (add adjustment_price) when the first marked-up search model lands.
    const offenders: string[] = [];
    for (const model of getModels()) {
        const definition = getRegistryModelDefinition(model);
        if (!definition.billing?.adjustments?.length) continue;
        if (definition.priceMultiplier !== 1) {
            offenders.push(
                `${model} (priceMultiplier=${definition.priceMultiplier})`,
            );
        }
    }
    expect(
        offenders,
        `Models with billing adjustments must have priceMultiplier === 1:\n${offenders.join("\n")}`,
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
