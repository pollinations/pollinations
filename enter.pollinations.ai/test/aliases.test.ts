import { IMAGE_SERVICES } from "@shared/registry/image";
import type { ModelDefinition } from "@shared/registry/registry.js";
import {
    calculateCost,
    calculatePrice,
    getActivePriceDefinition,
    getModelDefinition,
    resolveModelName,
} from "@shared/registry/registry.js";
import { TEXT_SERVICES } from "@shared/registry/text";
import { expect, test } from "vitest";

function serviceAliasTestCases(
    services: Record<string, ModelDefinition>,
): string[][] {
    return Object.entries(services).flatMap(([serviceId, serviceDefinition]) =>
        serviceDefinition.aliases.map((alias) => [alias, serviceId]),
    );
}

test.for(
    serviceAliasTestCases(TEXT_SERVICES),
)("Text service alias %s is resolved to %s", ([alias, shouldResolveTo]) => {
    const resolved = resolveModelName(alias);
    expect(resolved).toBe(shouldResolveTo);
});

test.for(
    serviceAliasTestCases(IMAGE_SERVICES),
)("Image service alias %s is resolved to %s", ([alias, shouldResolveTo]) => {
    const resolved = resolveModelName(alias);
    expect(resolved).toBe(shouldResolveTo);
});

test("cost lookup uses the public model name instead of collapsing shared provider ids", () => {
    const usage = {
        promptTextTokens: 1_000_000,
        completionTextTokens: 1_000_000,
    };
    const geminiFastCost = calculateCost("gemini-fast", usage);
    const geminiSearchCost = calculateCost("gemini-search", usage);

    expect(geminiFastCost.totalCost).not.toBe(geminiSearchCost.totalCost);
});

test("gemini-fast can expose a higher public price than provider cost", () => {
    const usage = {
        promptTextTokens: 1_000_000,
        promptCachedTokens: 1_000_000,
        completionTextTokens: 1_000_000,
    };
    const priceDefinition = getActivePriceDefinition("gemini-fast");
    const geminiFastCost = calculateCost("gemini-fast", usage);
    const geminiFastPrice = calculatePrice("gemini-fast", usage);

    expect(priceDefinition).toMatchObject({
        promptTextTokens: 0.0000003,
        promptCachedTokens: 0.00000003,
        completionTextTokens: 0.0000012,
    });
    expect(geminiFastCost.totalCost).toBeCloseTo(0.51, 8);
    expect(geminiFastPrice.totalPrice).toBeCloseTo(1.53, 8);
    expect(geminiFastPrice.totalPrice).toBeGreaterThan(
        geminiFastCost.totalCost,
    );
});

test("image model with marked-up price bills users above provider cost", () => {
    const usage = { completionImageTokens: 1 };
    const cost = calculateCost("seedream", usage);
    const price = calculatePrice("seedream", usage);

    expect(cost.totalCost).toBeCloseTo(0.03, 8);
    expect(price.totalPrice).toBeCloseTo(0.045, 8);
    expect(price.totalPrice).toBeGreaterThan(cost.totalCost);
});

test("video model with marked-up price bills users above provider cost", () => {
    const usage = { completionVideoSeconds: 1, completionAudioSeconds: 1 };
    const cost = calculateCost("wan", usage);
    const price = calculatePrice("wan", usage);

    expect(cost.totalCost).toBeCloseTo(0.1, 8);
    expect(price.totalPrice).toBeCloseTo(0.15, 8);
    expect(price.totalPrice).toBeGreaterThan(cost.totalCost);
});

test("ElevenLabs audio models are paid-only and billed with 1.5x markup", () => {
    const cases = [
        { model: "elevenlabs", usage: { completionAudioTokens: 1000 } },
        { model: "elevenmusic", usage: { completionAudioSeconds: 60 } },
        { model: "scribe", usage: { promptAudioSeconds: 3600 } },
    ] as const;

    for (const { model, usage } of cases) {
        const definition = getModelDefinition(model);
        const cost = calculateCost(model, usage);
        const price = calculatePrice(model, usage);

        expect(definition.provider).toBe("elevenlabs");
        expect(definition.paidOnly).toBe(true);
        expect(price.totalPrice).toBeCloseTo(cost.totalCost * 1.5, 8);
        expect(price.totalPrice).toBeGreaterThan(cost.totalCost);
    }
});

test("GPT Image 2 is paid-only and billed with 1.5x markup", () => {
    const usage = {
        promptTextTokens: 1_000_000,
        promptCachedTokens: 1_000_000,
        promptImageTokens: 1_000_000,
        completionImageTokens: 1_000_000,
    };
    const definition = getModelDefinition("gpt-image-2");
    const cost = calculateCost("gpt-image-2", usage);
    const price = calculatePrice("gpt-image-2", usage);

    expect(definition.provider).toBe("openai");
    expect(definition.paidOnly).toBe(true);
    expect(cost.totalCost).toBeCloseTo(44.25, 8);
    expect(price.totalPrice).toBeCloseTo(cost.totalCost * 1.5, 8);
    expect(price.totalPrice).toBeGreaterThan(cost.totalCost);
});

test("model without explicit price falls back to cost for both values", () => {
    const usage = { completionImageTokens: 1 };
    const cost = calculateCost("flux", usage);
    const price = calculatePrice("flux", usage);

    expect(price.totalPrice).toBeCloseTo(cost.totalCost, 8);
});

test("DeepSeek V4 models are paid-only and billed at provider cost", () => {
    const usage = {
        promptTextTokens: 1_000_000,
        promptCachedTokens: 1_000_000,
        completionTextTokens: 1_000_000,
    };

    const expectedCosts = {
        deepseek: 0.448,
        "deepseek-pro": 5.36,
    } as const;
    const expectedProviders = {
        deepseek: "deepinfra",
        "deepseek-pro": "fireworks",
    } as const;

    for (const model of ["deepseek", "deepseek-pro"] as const) {
        const definition = getModelDefinition(model);
        const cost = calculateCost(model, usage);
        const price = calculatePrice(model, usage);

        expect(definition.provider).toBe(expectedProviders[model]);
        expect(definition.paidOnly).toBe(true);
        expect(cost.totalCost).toBeCloseTo(expectedCosts[model], 8);
        expect(price.totalPrice).toBeCloseTo(cost.totalCost, 8);
    }
});
