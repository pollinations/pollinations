import { 
    resolveServiceId, 
    getModelDefinition,
    calculateCost,
    calculatePrice,
    isFreeService
} from "../registry/registry.ts";
import { fromDPMT, ZERO_PRICE, ZERO_PRICE_START_DATE, PRICING_START_DATE } from "../registry/price-helpers.ts";
import { expect, test } from "vitest";
import type { TokenUsage } from "../registry/registry.ts";

// Test with real services from the registry
test("isFreeService should return the correct values", async () => {
    // Test with actual free services
    expect(isFreeService("openai")).toBe(true);
    // openai-large is NOT free - it has pricing
    expect(isFreeService("openai-large")).toBe(false);
});

test("calculateCost should return the correct costs", async () => {
    const usage = {
        unit: "TOKENS",
        promptTextTokens: 1_000_000,
        promptCachedTokens: 1_000_000,
        completionTextTokens: 1_000_000,
    } satisfies TokenUsage;
    
    // Test with a real model - gpt-5-nano has known pricing
    const cost = calculateCost("gpt-5-nano-2025-08-07", usage);
    
    // gpt-5-nano pricing: $0.055 per 1M prompt tokens, $0.44 per 1M completion tokens
    // Cost is returned in dollars (not micro-dollars)
    expect(cost.promptTextTokens).toBe(0.055); // $0.055
    expect(cost.completionTextTokens).toBe(0.44); // $0.44
});

test("calculatePrice should return the correct price", async () => {
    const usage = {
        unit: "TOKENS",
        promptTextTokens: 1_000_000,
        promptCachedTokens: 1_000_000,
        completionTextTokens: 1_000_000,
    } satisfies TokenUsage;
    
    // Test with real free service
    const freePrice = calculatePrice("openai", usage);
    expect(freePrice.promptTextTokens).toBe(0.0);
    expect(freePrice.promptCachedTokens).toBe(0.0);
    expect(freePrice.completionTextTokens).toBe(0.0);
    expect(freePrice.totalPrice).toBe(0.0);
});

test("Usage types with undefined cost or price should throw an error", async () => {
    const usage = {
        unit: "TOKENS",
        promptImageTokens: 1_000_000,
    } satisfies TokenUsage;
    
    // Should throw when trying to calculate cost for unsupported usage type
    expect(() => calculateCost("gpt-5-nano-2025-08-07", usage)).toThrow();
    expect(() => calculatePrice("openai", usage)).toThrow();
});

test("fromDPMT should correctly convert dollars per million tokens", async () => {
    // Test basic conversion
    expect(fromDPMT(1_000_000)).toBe(1.0);
    expect(fromDPMT(50)).toBe(0.00005);
    expect(fromDPMT(200)).toBe(0.0002);
    
    // Test edge cases
    expect(fromDPMT(0)).toBe(0);
    expect(fromDPMT(1)).toBe(0.000001);
    
    // Test that it matches expected pricing calculations
    const usage = {
        unit: "TOKENS",
        promptTextTokens: 1_000_000,
        completionTextTokens: 1_000_000,
    } satisfies TokenUsage;
    
    // Using fromDPMT(50) means $50 per million tokens
    // So 1 million tokens * $0.00005 per token = $50
    const priceWithHelper = fromDPMT(50) * usage.promptTextTokens;
    expect(priceWithHelper).toBe(50);
    
    // Verify it works in registry context (registry multiplies by 1000 for cost)
    const costPerToken = fromDPMT(50); // 0.00005
    const totalCost = costPerToken * usage.promptTextTokens * 1000; // Cost in registry units
    expect(totalCost).toBe(50_000);
});

test("ZERO_PRICE constant should have all zero values", async () => {
    expect(ZERO_PRICE.promptTextTokens).toBe(0.0);
    expect(ZERO_PRICE.promptCachedTokens).toBe(0.0);
    expect(ZERO_PRICE.completionTextTokens).toBe(0.0);
    expect(ZERO_PRICE.promptAudioTokens).toBe(0.0);
    expect(ZERO_PRICE.completionAudioTokens).toBe(0.0);
    expect(ZERO_PRICE.completionImageTokens).toBe(0.0);
    expect(ZERO_PRICE.date).toBe(ZERO_PRICE_START_DATE);
});

test("Date constants should be properly defined", async () => {
    expect(ZERO_PRICE_START_DATE).toBe(new Date("2020-01-01 00:00:00").getTime());
    expect(PRICING_START_DATE).toBe(new Date("2025-08-01 00:00:00").getTime());
    expect(PRICING_START_DATE).toBeGreaterThan(ZERO_PRICE_START_DATE);
});

test("resolveServiceId should throw on invalid service", async () => {
    expect(() => resolveServiceId("invalid-service", "generate.text"))
        .toThrow();
});

test("resolveServiceId should return default service for null/undefined", async () => {
    // Uses real registry defaults (openai for text, flux for image)
    const result = resolveServiceId(null, "generate.text");
    expect(result).toBe("openai");
});

test("resolveServiceId should resolve aliases", async () => {
    // Test with real aliases from the registry
    expect(resolveServiceId("openai-large", "generate.text")).toBe("openai-large");
    expect(resolveServiceId("openai-fast", "generate.text")).toBe("openai-fast");
});

test("getModelDefinition returns undefined for invalid model", async () => {
    // getModelDefinition returns undefined for missing models
    expect(getModelDefinition("invalid-model" as any)).toBeUndefined();
});
