import { expect, test } from "vitest";
import { AUDIO_SERVICES } from "../../shared/registry/audio.ts";
import { EMBEDDING_SERVICES } from "../../shared/registry/embeddings.ts";
import { IMAGE_SERVICES } from "../../shared/registry/image.ts";
import {
    calculateCost,
    calculatePrice,
    getModelDefinition,
    getPriceDefinition,
} from "../../shared/registry/registry.ts";
import { TEXT_SERVICES } from "../../shared/registry/text.ts";
import { getModelPrices } from "../src/client/components/models/data.ts";

test("pricing data applies the per-model price multiplier uniformly", () => {
    const geminiFast = getModelPrices().find(
        (price) => price.name === "gemini-fast",
    );

    expect(geminiFast).toMatchObject({
        name: "gemini-fast",
        type: "text",
        promptTextPrice: "0.15",
        promptCachedPrice: "0.015",
        promptAudioPrice: "0.45",
        completionTextPrice: "0.6",
    });
});

test("pricing data still exposes standard models through the default price fallback", () => {
    const openai = getModelPrices().find((price) => price.name === "openai");

    expect(openai).toMatchObject({
        name: "openai",
        type: "text",
        promptTextPrice: "0.2",
        promptCachedPrice: "0.02",
        completionTextPrice: "1.25",
    });
});

test("grok pricing uses its non-zero registry fallback", () => {
    const grok = getModelPrices().find((price) => price.name === "grok");

    expect(grok).toMatchObject({
        name: "grok",
        type: "text",
        promptTextPrice: "2.0",
        promptCachedPrice: "0.2",
        completionTextPrice: "6.0",
    });
});

test("AssemblyAI STT pricing is exposed per input audio second", () => {
    const universal2 = getModelPrices().find(
        (price) => price.name === "universal-2",
    );
    const universal3Pro = getModelPrices().find(
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
    expect(getModelDefinition("universal-3-pro").paidOnly).toBe(true);

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

    // Gemini 2.5 Search bills once per grounded prompt, not once per query.
    expect(geminiSearchCost.totalCost).toBeCloseTo(0.535, 8);
    expect(geminiSearchPrice.totalPrice).toBeCloseTo(0.8025, 8);

    // Gemini 3.x bills per non-empty search query.
    expect(gemini3Cost.totalCost).toBeCloseTo(3.528, 8);
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

    expect(shortContextCost.totalCost).toBeCloseTo(0.412, 8);
    expect(longContextCost.totalCost).toBeCloseTo(0.818004, 8);
    expect(longContextPrice.totalPrice).toBeCloseTo(1.227006, 8);
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
