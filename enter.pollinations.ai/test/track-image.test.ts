import { expect, test } from "vitest";
import { REGISTRY } from "@shared/registry/registry.ts";
import type { TokenUsage } from "@shared/registry/registry.ts";

// Test image model cost tracking
// Tests that flux has correct operational cost estimate

test("Flux should have operational cost of 0.3 cents per image", () => {
    const usage: TokenUsage = {
        unit: "TOKENS",
        completionImageTokens: 1, // Flux uses 1 token per image
    };
    
    const cost = REGISTRY.calculateCost("flux", usage);
    
    // 0.3 cents = $0.003 per image
    expect(cost.completionImageTokens).toBe(0.003);
    expect(cost.totalCost).toBe(0.003);
});

test("Nanobanana should calculate cost correctly for high token counts", () => {
    const usage: TokenUsage = {
        unit: "TOKENS",
        completionImageTokens: 1290, // Typical nanobanana token count
    };
    
    const cost = REGISTRY.calculateCost("nanobanana", usage);
    
    // Nanobanana: $30 per 1M tokens = $0.00003 per token
    // 1290 tokens * $0.00003 = $0.0387
    expect(cost.completionImageTokens).toBeCloseTo(0.0387, 4);
    expect(cost.totalCost).toBeCloseTo(0.0387, 4);
});

test("Flux price should remain free for users", () => {
    const usage: TokenUsage = {
        unit: "TOKENS",
        completionImageTokens: 1,
    };
    
    const price = REGISTRY.calculatePrice("flux", usage);
    
    // Users pay $0 (free tier)
    expect(price.completionImageTokens).toBe(0);
    expect(price.totalPrice).toBe(0);
});

test("Other image models should have correct costs", () => {
    const usage: TokenUsage = {
        unit: "TOKENS",
        completionImageTokens: 1,
    };
    
    // Kontext, turbo, seedream currently have zero cost
    // (may need to be updated with operational cost estimates)
    const kontextCost = REGISTRY.calculateCost("kontext", usage);
    const turboCost = REGISTRY.calculateCost("turbo", usage);
    const seedreamCost = REGISTRY.calculateCost("seedream", usage);
    
    expect(kontextCost.totalCost).toBe(0);
    expect(turboCost.totalCost).toBe(0);
    expect(seedreamCost.totalCost).toBe(0);
});
