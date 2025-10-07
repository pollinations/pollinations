import { createRegistry, REGISTRY } from "@/registry/registry";
import { fromDPMT, ZERO_PRICE, ZERO_PRICE_START_DATE, PRICING_START_DATE } from "@/registry/price-helpers";
import { expect, test } from "vitest";
import type {
    ServiceRegistry,
    ModelProviderRegistry,
    TokenUsage,
} from "@/registry/registry";

const MOCK_MODEL_PROVIDERS = {
    "mock-model": {
        displayName: "Mock Model",
        costType: "per_generation_cost",
        cost: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                promptTextTokens: 0.05,
                promptCachedTokens: 0.05,
                completionTextTokens: 0.1,
            },
        ],
    },
} as const satisfies ModelProviderRegistry;

const MOCK_SERVICES = {
    "free-service": {
        displayName: "Free Service",
        aliases: ["free-service-alias-a", "free-service-alias-b"],
        modelProviders: ["mock-model"],
        price: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                promptTextTokens: 0.0,
                promptCachedTokens: 0.0,
                completionTextTokens: 0.0,
            },
        ],
    },
    "paid-service": {
        displayName: "Paid Service",
        aliases: ["paid-service-alias"],
        modelProviders: ["mock-model"],
        price: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                promptTextTokens: 0.05,
                promptCachedTokens: 0.05,
                completionTextTokens: 0.1,
            },
        ],
    },
} as const satisfies ServiceRegistry<typeof MOCK_MODEL_PROVIDERS>;

const MOCK_REGISTRY = createRegistry(MOCK_MODEL_PROVIDERS, MOCK_SERVICES);

test("isFreeService should return the correct values", async () => {
    expect(MOCK_REGISTRY.isFreeService("free-service")).toBe(true);
    expect(MOCK_REGISTRY.isFreeService("paid-service")).toBe(false);
});

test("calculateCost should return the correct costs", async () => {
    const usage = {
        unit: "TOKENS",
        promptTextTokens: 1_000_000,
        promptCachedTokens: 1_000_000,
        completionTextTokens: 1_000_000,
    } satisfies TokenUsage;
    const cost = MOCK_REGISTRY.calculateCost("mock-model", usage);
    expect(cost.promptTextTokens).toBe(50_000);
    expect(cost.promptCachedTokens).toBe(50_000);
    expect(cost.completionTextTokens).toBe(100_000);
});

test("calculatePrice should return the correct price", async () => {
    const usage = {
        unit: "TOKENS",
        promptTextTokens: 1_000_000,
        promptCachedTokens: 1_000_000,
        completionTextTokens: 1_000_000,
    } satisfies TokenUsage;
    const freePrice = MOCK_REGISTRY.calculatePrice("free-service", usage);
    expect(freePrice.promptTextTokens).toBe(0.0);
    expect(freePrice.promptCachedTokens).toBe(0.0);
    expect(freePrice.completionTextTokens).toBe(0.0);
    expect(freePrice.totalPrice).toBe(0.0);
    const paidPrice = MOCK_REGISTRY.calculatePrice("paid-service", usage);
    expect(paidPrice.promptTextTokens).toBe(50_000);
    expect(paidPrice.promptCachedTokens).toBe(50_000);
    expect(paidPrice.completionTextTokens).toBe(100_000);
    expect(paidPrice.totalPrice).toBe(200_000);
});

test("Usage types with undefined cost or price should throw an error", async () => {
    const usage = {
        unit: "TOKENS",
        promptImageTokens: 1_000_000,
    } satisfies TokenUsage;
    expect(() => MOCK_REGISTRY.calculateCost("mock-model", usage)).toThrow();
    expect(() => MOCK_REGISTRY.calculatePrice("free-service", usage)).toThrow();
    expect(() => MOCK_REGISTRY.calculatePrice("paid-service", usage)).toThrow();
});

test("Aliases should be resolved by the registry", async () => {
    expect(
        MOCK_REGISTRY.resolveServiceId("free-service", "generate.text"),
    ).toBe("free-service");
    expect(
        MOCK_REGISTRY.resolveServiceId(
            "free-service-alias-a",
            "generate.text",
        ),
    ).toBe("free-service");
    expect(
        MOCK_REGISTRY.resolveServiceId(
            "free-service-alias-b",
            "generate.text",
        ),
    ).toBe("free-service");
    expect(
        MOCK_REGISTRY.resolveServiceId("paid-service", "generate.text"),
    ).toBe("paid-service");
    expect(
        MOCK_REGISTRY.resolveServiceId(
            "paid-service-alias",
            "generate.text",
        ),
    ).toBe("paid-service");
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
