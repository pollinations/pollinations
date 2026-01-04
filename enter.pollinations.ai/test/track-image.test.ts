import type { ModelId, TokenUsage } from "@shared/registry/registry.ts";
import { calculateCost } from "@shared/registry/registry.ts";
import { expect, test } from "vitest";

// Test image model cost tracking
// Tests cost calculation properties without hardcoding specific values

test("Image models should calculate costs proportionally to token count", () => {
    const models: ModelId[] = [
        "flux",
        "nanobanana",
        "kontext",
        "turbo",
        "seedream",
    ];

    for (const model of models) {
        const usage1: TokenUsage = {
            unit: "TOKENS",
            completionImageTokens: 1,
        };
        const usage10: TokenUsage = {
            unit: "TOKENS",
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
    const usage: TokenUsage = {
        unit: "TOKENS",
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
    const models: ModelId[] = [
        "flux",
        "nanobanana",
        "kontext",
        "turbo",
        "seedream",
    ];
    const usage: TokenUsage = {
        unit: "TOKENS",
        completionImageTokens: 1,
    };

    for (const model of models) {
        const cost = calculateCost(model, usage);

        expect(cost.totalCost).toBeGreaterThanOrEqual(0);
        expect(cost.completionImageTokens || 0).toBeGreaterThanOrEqual(0);
    }
});

test("gptimage-large should calculate costs for image output tokens", () => {
    const usage: TokenUsage = {
        unit: "TOKENS",
        completionImageTokens: 1000,
    };
    const cost = calculateCost("gptimage-large", usage);
    // $32 per 1M tokens = $0.032 per 1K tokens
    expect(cost.completionImageTokens).toBeCloseTo(0.032, 4);
    expect(cost.totalCost).toBeCloseTo(0.032, 4);
});

test("gptimage-large should calculate costs for text input tokens", () => {
    const usage: TokenUsage = {
        unit: "TOKENS",
        promptTextTokens: 1000,
    };
    const cost = calculateCost("gptimage-large", usage);
    // $8 per 1M tokens = $0.008 per 1K tokens
    expect(cost.promptTextTokens).toBeCloseTo(0.008, 4);
    expect(cost.totalCost).toBeCloseTo(0.008, 4);
});

test("gptimage-large should calculate costs for image input tokens", () => {
    const usage: TokenUsage = {
        unit: "TOKENS",
        promptImageTokens: 1000,
    };
    const cost = calculateCost("gptimage-large", usage);
    // $8 per 1M tokens = $0.008 per 1K tokens
    expect(cost.promptImageTokens).toBeCloseTo(0.008, 4);
    expect(cost.totalCost).toBeCloseTo(0.008, 4);
});

test("gptimage-large combined input + output costs", () => {
    const usage: TokenUsage = {
        unit: "TOKENS",
        promptTextTokens: 500,
        promptImageTokens: 3000, // Typical resized input ~3K tokens
        completionImageTokens: 1000,
    };
    const cost = calculateCost("gptimage-large", usage);
    // Input: 500*$8/1M + 3000*$8/1M = $0.028
    // Output: 1000*$32/1M = $0.032
    expect(cost.totalCost).toBeCloseTo(0.06, 4);
});
