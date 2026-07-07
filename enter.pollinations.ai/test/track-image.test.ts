import type { ModelName, Usage, UsageType } from "@shared/registry/registry.ts";
import {
    calculateCost,
    getCostDefinition,
    getPriceDefinition,
} from "@shared/registry/registry.ts";
import { priceToEventParams } from "@shared/schemas/generation-event.ts";
import { expect, test } from "vitest";

// Test image model cost tracking
// Tests cost calculation properties without hardcoding specific values

function requiredCostRate(model: ModelName, field: UsageType): number {
    const rate = getCostDefinition(model)?.[field];

    expect(rate, `${model}.${field} must have a configured cost`).toEqual(
        expect.any(Number),
    );
    expect(rate).toBeGreaterThan(0);

    return rate as number;
}

test("Image models should calculate costs proportionally to token count", () => {
    const models: ModelName[] = [
        "flux",
        "nanobanana",
        "kontext",
        "zimage",
        "seedream",
    ];

    for (const model of models) {
        const usage1: Usage = {
            completionImageTokens: 1,
        };
        const usage10: Usage = {
            completionImageTokens: 10,
        };

        const cost1 = calculateCost(model, usage1);
        const cost10 = calculateCost(model, usage10);

        // Cost should scale linearly with token count
        expect(cost10.completionImageTokens).toBeCloseTo(
            (cost1.completionImageTokens || 0) * 10,
            6,
        );
        expect(cost10.totalCost).toBeCloseTo(cost1.totalCost * 10, 6);
    }
});

test("Models with API costs should have non-zero operational costs", () => {
    const usage: Usage = {
        completionImageTokens: 1,
    };

    // Flux has operational cost estimate
    const fluxCost = calculateCost("flux", usage);
    expect(fluxCost.totalCost).toBeGreaterThan(0);

    // Nanobanana uses Vertex AI (paid API)
    const nanobanana = calculateCost("nanobanana", usage);
    expect(nanobanana.totalCost).toBeGreaterThan(0);
});

test("Cost should be non-negative for all models", () => {
    const models: ModelName[] = [
        "flux",
        "nanobanana",
        "kontext",
        "zimage",
        "seedream",
    ];
    const usage: Usage = {
        completionImageTokens: 1,
    };

    for (const model of models) {
        const cost = calculateCost(model, usage);

        expect(cost.totalCost).toBeGreaterThanOrEqual(0);
        expect(cost.completionImageTokens || 0).toBeGreaterThanOrEqual(0);
    }
});

test("gptimage-large should calculate costs for image output tokens", () => {
    const usage: Usage = {
        completionImageTokens: 1000,
    };
    const cost = calculateCost("gptimage-large", usage);
    const rate = requiredCostRate("gptimage-large", "completionImageTokens");
    const expectedCost = rate * (usage.completionImageTokens ?? 0);

    expect(cost.completionImageTokens).toBeCloseTo(expectedCost, 4);
    expect(cost.totalCost).toBeCloseTo(expectedCost, 4);
});

test("gptimage-large should calculate costs for text input tokens", () => {
    const usage: Usage = {
        promptTextTokens: 1000,
    };
    const cost = calculateCost("gptimage-large", usage);
    const rate = requiredCostRate("gptimage-large", "promptTextTokens");
    const expectedCost = rate * (usage.promptTextTokens ?? 0);

    expect(cost.promptTextTokens).toBeCloseTo(expectedCost, 4);
    expect(cost.totalCost).toBeCloseTo(expectedCost, 4);
});

test("gptimage-large should calculate costs for image input tokens", () => {
    const usage: Usage = {
        promptImageTokens: 1000,
    };
    const cost = calculateCost("gptimage-large", usage);
    const rate = requiredCostRate("gptimage-large", "promptImageTokens");
    const expectedCost = rate * (usage.promptImageTokens ?? 0);

    expect(cost.promptImageTokens).toBeCloseTo(expectedCost, 4);
    expect(cost.totalCost).toBeCloseTo(expectedCost, 4);
});

test("gptimage-large should calculate costs for text output tokens", () => {
    const usage: Usage = {
        completionTextTokens: 1000,
    };
    const cost = calculateCost("gptimage-large", usage);
    const rate = requiredCostRate("gptimage-large", "completionTextTokens");
    const expectedCost = rate * (usage.completionTextTokens ?? 0);

    expect(cost.completionTextTokens).toBeCloseTo(expectedCost, 4);
    expect(cost.totalCost).toBeCloseTo(expectedCost, 4);
});

test("gptimage-large combined text/image input + output costs", () => {
    const usage: Usage = {
        promptTextTokens: 500,
        promptImageTokens: 3000, // Typical resized input ~3K tokens
        completionTextTokens: 200,
        completionImageTokens: 1000,
    };
    const cost = calculateCost("gptimage-large", usage);
    const expectedCost =
        requiredCostRate("gptimage-large", "promptTextTokens") *
            (usage.promptTextTokens ?? 0) +
        requiredCostRate("gptimage-large", "promptImageTokens") *
            (usage.promptImageTokens ?? 0) +
        requiredCostRate("gptimage-large", "completionTextTokens") *
            (usage.completionTextTokens ?? 0) +
        requiredCostRate("gptimage-large", "completionImageTokens") *
            (usage.completionImageTokens ?? 0);

    expect(cost.totalCost).toBeCloseTo(expectedCost, 4);
});

test("nanobanana models calculate reasoning token costs", () => {
    const usage: Usage = {
        promptTextTokens: 11,
        completionImageTokens: 1120,
        completionReasoningTokens: 335,
    };

    const flashCost = calculateCost("nanobanana-2", usage);
    expect(flashCost.completionReasoningTokens).toBeCloseTo(
        requiredCostRate("nanobanana-2", "completionTextTokens") *
            (usage.completionReasoningTokens ?? 0),
        8,
    );
    expect(flashCost.totalCost).toBeGreaterThan(
        flashCost.completionImageTokens || 0,
    );

    const proCost = calculateCost("nanobanana-pro", usage);
    expect(proCost.completionReasoningTokens).toBeCloseTo(
        requiredCostRate("nanobanana-pro", "completionTextTokens") *
            (usage.completionReasoningTokens ?? 0),
        8,
    );
    expect(proCost.totalCost).toBeGreaterThan(
        proCost.completionImageTokens || 0,
    );
});

test("nanobanana reasoning token event prices use text output rates", () => {
    const flashPrice = getPriceDefinition("nanobanana-2");
    const flashEventPrices = priceToEventParams(flashPrice);
    expect(flashEventPrices.tokenPriceCompletionReasoning).toBe(
        flashPrice?.completionTextTokens,
    );

    const proPrice = getPriceDefinition("nanobanana-pro");
    const proEventPrices = priceToEventParams(proPrice);
    expect(proEventPrices.tokenPriceCompletionReasoning).toBe(
        proPrice?.completionTextTokens,
    );
});
