import { expect, test } from "vitest";
import { calculateCost, calculatePrice } from "@shared/registry/registry.ts";
import type {
    TokenUsage,
    ModelId,
    ServiceId,
} from "@shared/registry/registry.ts";

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
