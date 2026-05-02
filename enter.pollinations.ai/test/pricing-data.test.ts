import { expect, test } from "vitest";
import {
    calculateCost,
    calculatePrice,
    getActivePriceDefinition,
    getModelDefinition,
} from "../../shared/registry/registry.ts";
import { getModelPrices } from "../src/client/components/pricing/data.ts";

test("pricing data uses explicit public price when a model defines one", () => {
    const geminiFast = getModelPrices().find(
        (price) => price.name === "gemini-fast",
    );

    expect(geminiFast).toMatchObject({
        name: "gemini-fast",
        type: "text",
        promptTextPrice: "0.3",
        promptCachedPrice: "0.03",
        promptAudioPrice: "0.3",
        completionTextPrice: "1.2",
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
        const priceDefinition = getActivePriceDefinition(model);
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
