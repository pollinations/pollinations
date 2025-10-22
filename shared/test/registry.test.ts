import { 
    resolveServiceId, 
    getModelDefinition,
    calculateCost,
    calculatePrice,
    isFreeService,
    getRequiredTier,
    canAccessService,
    SERVICE_REGISTRY
} from "../registry/registry.ts";
import { perMillion, ZERO_PRICE, ZERO_PRICE_START_DATE, PRICING_START_DATE } from "../registry/price-helpers.ts";
import { expect, test } from "vitest";
import type { TokenUsage } from "../registry/registry.ts";

// Test with real services from the registry
test("isFreeService should return the correct values", async () => {
    // Test with actual free services
    expect(isFreeService("openai-fast")).toBe(true);
    expect(isFreeService("chickytutor")).toBe(true);
    expect(isFreeService("midijourney")).toBe(true);
    // openai and openai-large are NOT free - they have pricing
    expect(isFreeService("openai")).toBe(false);
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
    
    // gpt-5-nano pricing: $0.06 per 1M prompt tokens, $0.44 per 1M completion tokens
    // Cost is returned in dollars (not micro-dollars)
    expect(cost.promptTextTokens).toBe(0.06); // $0.06
    expect(cost.completionTextTokens).toBe(0.44); // $0.44
});

test("calculatePrice should return the correct price", async () => {
    const usage = {
        unit: "TOKENS",
        promptTextTokens: 1_000_000,
        promptCachedTokens: 1_000_000,
        completionTextTokens: 1_000_000,
    } satisfies TokenUsage;
    
    // Test with real free service (openai-fast is marked as free)
    const freePrice = calculatePrice("openai-fast", usage);
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

// Tier System Tests
test("getRequiredTier should return correct tier for services", async () => {
    // Test anonymous tier (free services)
    expect(getRequiredTier("openai")).toBe("anonymous");
    expect(getRequiredTier("openai-fast")).toBe("anonymous");
    expect(getRequiredTier("qwen-coder")).toBe("anonymous");
    
    // Test seed tier (authenticated free)
    expect(getRequiredTier("deepseek")).toBe("seed");
    expect(getRequiredTier("gemini")).toBe("seed");
    expect(getRequiredTier("flux")).toBe("seed");
    
    // Test flower tier
    expect(getRequiredTier("claudyclaude")).toBe("flower");
});

test("getRequiredTier should throw for invalid service", async () => {
    expect(() => getRequiredTier("invalid-service" as any))
        .toThrow("Service not found");
});

test("canAccessService should enforce tier hierarchy", async () => {
    // Anonymous tier can only access anonymous services
    expect(canAccessService("openai", "anonymous")).toBe(true);
    expect(canAccessService("flux", "anonymous")).toBe(false);
    expect(canAccessService("claudyclaude", "anonymous")).toBe(false);
    
    // Seed tier can access anonymous and seed
    expect(canAccessService("openai", "seed")).toBe(true);
    expect(canAccessService("flux", "seed")).toBe(true);
    expect(canAccessService("claudyclaude", "seed")).toBe(false);
    
    // Flower tier can access anonymous, seed, and flower
    expect(canAccessService("openai", "flower")).toBe(true);
    expect(canAccessService("flux", "flower")).toBe(true);
    expect(canAccessService("claudyclaude", "flower")).toBe(true);
    
    // Nectar tier can access all services
    expect(canAccessService("openai", "nectar")).toBe(true);
    expect(canAccessService("flux", "nectar")).toBe(true);
    expect(canAccessService("claudyclaude", "nectar")).toBe(true);
});

test("canAccessService should return false for invalid tiers", async () => {
    // Invalid user tier
    expect(canAccessService("openai", "invalid" as any)).toBe(false);
});

test("all services should have valid tier information", async () => {
    // Verify every service has a valid tier and check distribution
    const services = Object.entries(SERVICE_REGISTRY);
    expect(services.length).toBeGreaterThan(0);
    
    const servicesByTier = {
        anonymous: [] as string[],
        seed: [] as string[],
        flower: [] as string[],
        nectar: [] as string[],
    };
    
    for (const [serviceId, service] of services) {
        const tier = service.tier ?? "anonymous";
        expect(["anonymous", "seed", "flower", "nectar"]).toContain(tier);
        servicesByTier[tier].push(serviceId);
    }
    
    // Verify we have services at key tier levels
    expect(servicesByTier.anonymous.length).toBeGreaterThan(0);
    expect(servicesByTier.seed.length).toBeGreaterThan(0);
});
