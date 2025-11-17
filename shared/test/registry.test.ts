import {
    resolveServiceId,
    getModelDefinition,
    calculateCost,
    calculatePrice,
} from "../registry/registry.ts";
import { perMillion, COST_START_DATE } from "../registry/price-helpers.ts";
import { expect, test } from "vitest";
import type { TokenUsage } from "../registry/registry.ts";

// Test with real services from the registry
test("calculateCost should return the correct costs", async () => {
    const usage = {
        unit: "TOKENS",
        promptTextTokens: 1_000_000,
        promptCachedTokens: 1_000_000,
        completionTextTokens: 1_000_000,
    } satisfies TokenUsage;

    // Test with a real model - gpt-5-nano has known pricing
    const cost = calculateCost("gpt-5-nano-2025-08-07", usage);

    // gpt-5-nano pricing: $0.05 per 1M prompt tokens, $0.4 per 1M completion tokens
    // Cost is returned in dollars (not micro-dollars)
    expect(cost.promptTextTokens).toBe(0.05); // $0.05
    expect(cost.completionTextTokens).toBe(0.4); // $0.4
});

test("calculatePrice should return the correct price", async () => {
    const usage = {
        unit: "TOKENS",
        promptTextTokens: 1_000_000,
        promptCachedTokens: 1_000_000,
        completionTextTokens: 1_000_000,
    } satisfies TokenUsage;

    // Test with openai-fast which has pricing (gpt-5-nano-2025-08-07)
    // gpt-5-nano pricing: $0.05 per 1M prompt tokens, $0.005 per 1M cached, $0.4 per 1M completion
    const price = calculatePrice("openai-fast", usage);
    expect(price.promptTextTokens).toBe(0.05);
    expect(price.promptCachedTokens).toBe(0.005);
    expect(price.completionTextTokens).toBe(0.4);
    expect(price.totalPrice).toBe(0.455); // 0.05 + 0.005 + 0.4
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

test("perMillion should correctly convert dollars per million tokens", async () => {
    // Test basic conversion
    expect(perMillion(1_000_000)).toBe(1.0);
    expect(perMillion(50)).toBe(0.00005);
    expect(perMillion(200)).toBe(0.0002);

    // Test edge cases
    expect(perMillion(0)).toBe(0);
    expect(perMillion(1)).toBe(0.000001);

    // Test that it matches expected pricing calculations
    const usage = {
        unit: "TOKENS",
        promptTextTokens: 1_000_000,
        promptCachedTokens: 1_000_000,
        completionTextTokens: 1_000_000,
    } satisfies TokenUsage;

    // Using perMillion(50) means $50 per million tokens
    // So 1 million tokens * $0.00005 per token = $50
    const priceWithHelper = perMillion(50) * usage.promptTextTokens;
    expect(priceWithHelper).toBe(50);

    // Verify it works in registry context (registry multiplies by 1000 for cost)
    const costPerToken = perMillion(50); // 0.00005
    const totalCost = costPerToken * usage.promptTextTokens * 1000; // Cost in registry units
    expect(totalCost).toBe(50_000);
});

test("Date constants should be properly defined", async () => {
    expect(COST_START_DATE).toBe(new Date("2025-08-01 00:00:00").getTime());
});

test("resolveServiceId should throw on invalid service", async () => {
    expect(() =>
        resolveServiceId("invalid-service", "generate.text"),
    ).toThrow();
});

test("resolveServiceId should return default service for null/undefined", async () => {
    // Uses real registry defaults (openai for text, flux for image)
    const result = resolveServiceId(null, "generate.text");
    expect(result).toBe("openai");
});

test("resolveServiceId should resolve aliases", async () => {
    // Test with real aliases from the registry
    expect(resolveServiceId("openai-large", "generate.text")).toBe(
        "openai-large",
    );
    expect(resolveServiceId("openai-fast", "generate.text")).toBe(
        "openai-fast",
    );
});

test("getModelDefinition returns undefined for invalid model", async () => {
    // getModelDefinition returns undefined for missing models
    expect(getModelDefinition("invalid-model" as any)).toBeUndefined();
});

// Test alias resolution after PR #5340 refactor
test("resolveServiceId should resolve multiple aliases for same service", async () => {
    // Test that both aliases resolve to the same service
    expect(resolveServiceId("gpt-5-nano", "generate.text")).toBe("openai-fast");
    expect(resolveServiceId("openai-fast", "generate.text")).toBe(
        "openai-fast",
    );
});

test("resolveServiceId should handle image service aliases", async () => {
    // Test image service alias resolution
    const result = resolveServiceId(null, "generate.image");
    expect(result).toBe("flux"); // Default image model
});

test("resolveServiceId should be case-sensitive", async () => {
    // Service IDs and aliases are case-sensitive
    expect(() => resolveServiceId("OpenAI", "generate.text")).toThrow();
    expect(() => resolveServiceId("OPENAI-FAST", "generate.text")).toThrow();
});

test("getModelDefinition should return valid cost definitions", async () => {
    // Test that model definitions have proper structure
    const modelDef = getModelDefinition("gpt-5-nano-2025-08-07");
    expect(modelDef).toBeDefined();
    expect(Array.isArray(modelDef)).toBe(true);
    expect(modelDef!.length).toBeGreaterThan(0);
    expect(modelDef![0]).toHaveProperty("date");
    expect(modelDef![0]).toHaveProperty("promptTextTokens");
});

test("calculateCost should handle zero usage", async () => {
    const usage = {
        unit: "TOKENS",
        promptTextTokens: 0,
        completionTextTokens: 0,
    } satisfies TokenUsage;

    const cost = calculateCost("gpt-5-nano-2025-08-07", usage);
    expect(cost.promptTextTokens).toBe(0);
    expect(cost.completionTextTokens).toBe(0);
    expect(cost.totalCost).toBe(0);
});

test("calculatePrice should handle zero usage", async () => {
    const usage = {
        unit: "TOKENS",
        promptTextTokens: 0,
        completionTextTokens: 0,
    } satisfies TokenUsage;

    const price = calculatePrice("openai-fast", usage);
    expect(price.totalPrice).toBe(0);
});

test("calculateCost should throw for invalid model", async () => {
    const usage = {
        unit: "TOKENS",
        promptTextTokens: 1000,
        completionTextTokens: 1000,
    } satisfies TokenUsage;

    expect(() => calculateCost("invalid-model-id", usage)).toThrow();
});

test("calculatePrice should throw for invalid service", async () => {
    const usage = {
        unit: "TOKENS",
        promptTextTokens: 1000,
        completionTextTokens: 1000,
    } satisfies TokenUsage;

    expect(() => calculatePrice("invalid-service" as any, usage)).toThrow();
});

// Tier system tests removed - tier gating now handled by enter.pollinations.ai
