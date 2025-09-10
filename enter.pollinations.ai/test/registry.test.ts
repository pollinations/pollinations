import { createRegistry, REGISTRY } from "@/registry";
import { expect, test } from "vitest";
import type {
    ServiceRegistry,
    ModelProviderRegistry,
    TokenUsage,
} from "@/registry";

const MOCK_MODEL_PROVIDERS = {
    "mock-model": {
        displayName: "Mock Model",
        cost: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                promptTextTokens: {
                    unit: "DPMT",
                    rate: 0.05,
                },
                promptCachedTokens: {
                    unit: "DPMT",
                    rate: 0.05,
                },
                completionTextTokens: {
                    unit: "DPMT",
                    rate: 0.1,
                },
            },
        ],
    },
} as const satisfies ModelProviderRegistry;

const MOCK_SERVICES = {
    "free-service": {
        displayName: "Free Service",
        aliases: ["free-service-alias"],
        modelProviders: ["mock-model"],
        price: [
            {
                date: new Date("2025-08-01 00:00:00").getTime(),
                promptTextTokens: {
                    unit: "DPMT",
                    rate: 0.0,
                },
                promptCachedTokens: {
                    unit: "DPMT",
                    rate: 0.0,
                },
                completionTextTokens: {
                    unit: "DPMT",
                    rate: 0.0,
                },
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
                promptTextTokens: {
                    unit: "DPMT",
                    rate: 0.05,
                },
                promptCachedTokens: {
                    unit: "DPMT",
                    rate: 0.05,
                },
                completionTextTokens: {
                    unit: "DPMT",
                    rate: 0.1,
                },
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
    expect(cost.promptTextTokens).toBe(0.05);
    expect(cost.promptCachedTokens).toBe(0.05);
    expect(cost.completionTextTokens).toBe(0.1);
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
    expect(paidPrice.promptTextTokens).toBe(0.05);
    expect(paidPrice.promptCachedTokens).toBe(0.05);
    expect(paidPrice.completionTextTokens).toBe(0.1);
    expect(paidPrice.totalPrice).toBe(0.2);
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
