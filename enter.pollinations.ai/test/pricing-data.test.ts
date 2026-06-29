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
    getCostDefinition,
    getModelDefinition,
    getModels,
    getPriceDefinition,
    type ModelName,
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

const getCatalogModels = () => [
    ...getTextModelsInfo(),
    ...getImageModelsInfo(),
    ...getRealtimeModelsInfo(),
    ...getAudioModelsInfo(),
    ...getEmbeddingModelsInfo(),
];

const tokenPriceRows = [
    { registryField: "promptTextTokens", direction: "input", kind: "text" },
    {
        registryField: "promptCachedTokens",
        direction: "input",
        kind: "cached",
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

test("model info exposes public capabilities without raw implementation flags", () => {
    let checkedCapabilities = 0;

    for (const model of getCatalogModels()) {
        const publicModel = model as Record<string, unknown>;
        const definition = getModelDefinition(model.name as ModelName);
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

test("Gemini grounding cost is added by multiplier functors", () => {
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
    expect(gemini3Cost.totalCost).toBeCloseTo(3.528, 8);
    expect(geminiSearchFastCost.totalCost).toBeCloseTo(1.778, 8);
    expect(geminiSearchLargeCost.totalCost).toBeCloseTo(10.528, 8);
    expect(ungroundedGeminiSearchFastCost.totalCost).toBeCloseTo(1.75, 8);
});

test("Gemini multiplier billing metadata is exposed in model catalog metadata", () => {
    const geminiSearchFast = getTextModelsInfo().find(
        (model) => model.name === "gemini-search-fast",
    );
    const geminiLarge = getTextModelsInfo().find(
        (model) => model.name === "gemini-large",
    );

    expect(geminiSearchFast?.billing?.adjustments?.[0]).toMatchObject({
        id: "google.gemini_3.search_query.v1",
        kind: "search_query",
        unit: "query",
        count: "geminiWebSearchQueries",
        when: "grounded",
        unit_price: "0.014",
    });
    expect(geminiSearchFast?.billing?.description).toContain(
        "Gemini 3 Google Search fee",
    );
    expect(geminiLarge?.billing?.tiers?.[0]).toMatchObject({
        id: "google.gemini_3_1_pro.long_context.v1",
        description: "Prompts above 200K tokens use Gemini long-context rates.",
    });
});

test("Perplexity request search fees are added by multiplier functors", () => {
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

test("Perplexity provider-reported request cost is sanity bounded", () => {
    const usage = {
        promptTextTokens: 1_000_000,
        completionTextTokens: 1_000_000,
    };

    // Malformed or out-of-bound values fall back to the static $0.005 fee,
    // never to 0: huge (>10x static), negative, and NaN are all rejected.
    const rejected = [9.99, -0.5, Number.NaN];
    for (const requestCost of rejected) {
        const output = { usage: { cost: { request_cost: requestCost } } };
        expect(
            calculateCost("perplexity-fast", usage, output).totalCost,
        ).toBeCloseTo(2.005, 8);
        expect(
            calculatePrice("perplexity-fast", usage, output).totalPrice,
        ).toBeCloseTo(2.005, 8);
    }

    // The bound is inclusive: exactly 10x the static fee is still trusted.
    const atBound = { usage: { cost: { request_cost: 0.05 } } };
    expect(
        calculateCost("perplexity-fast", usage, atBound).totalCost,
    ).toBeCloseTo(2.05, 8);
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

test("Perplexity multiplier billing metadata exposes request fee metadata", () => {
    const models = getTextModelsInfo();

    expect(
        models.find((model) => model.name === "perplexity-fast")?.billing
            ?.adjustments?.[0],
    ).toMatchObject({
        id: "perplexity.sonar_low.search_request.v1",
        kind: "search_request",
        unit: "request",
        count: "perplexityRequest",
        when: "always",
        unit_price: "0.005",
    });
    expect(
        models.find((model) => model.name === "perplexity-fast")?.billing
            ?.description,
    ).toContain("Perplexity search request fee");
    expect(
        models.find((model) => model.name === "perplexity-deep")?.billing
            ?.adjustments?.[0].unit_price,
    ).toBe("0.012");
    expect(
        models.find((model) => model.name === "perplexity")?.billing
            ?.adjustments?.[0].unit_price,
    ).toBe("0.014");
    expect(
        models.find((model) => model.name === "perplexity-reasoning")?.billing
            ?.adjustments?.[0].unit_price,
    ).toBe("0.014");
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
