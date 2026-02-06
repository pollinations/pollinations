import { env } from "cloudflare:test";
import { expect } from "vitest";
import { flattenBalances, sendToTinybird } from "@/events.ts";
import { exponentialBackoffDelay } from "@/util.ts";
import { test } from "./fixtures.ts";

test("sendToTinybird sends event to Tinybird API", async ({ log, mocks }) => {
    await mocks.enable("tinybird");

    const event = {
        id: "test-event-id",
        requestId: "test-request-id",
        requestPath: "/api/generate/openai",
        startTime: new Date(),
        endTime: new Date(Date.now() + 100),
        responseTime: 100,
        responseStatus: 200,
        environment: "test",
        eventType: "generate.text" as const,
        userId: "test-user-id",
        userTier: "seed",
        isBilledUsage: true,
        modelRequested: "openai",
        resolvedModelRequested: "openai",
        modelUsed: "gpt-4o-mini",
        modelProviderUsed: "azure-openai",
        tokenPricePromptText: 0,
        tokenPricePromptCached: 0,
        tokenPricePromptAudio: 0,
        tokenPricePromptImage: 0,
        tokenPriceCompletionText: 0,
        tokenPriceCompletionReasoning: 0,
        tokenPriceCompletionAudio: 0,
        tokenPriceCompletionImage: 0,
        tokenPriceCompletionVideoSeconds: 0,
        tokenPriceCompletionVideoTokens: 0,
        tokenCountPromptText: 100,
        tokenCountPromptCached: 0,
        tokenCountPromptAudio: 0,
        tokenCountPromptImage: 0,
        tokenCountCompletionText: 50,
        tokenCountCompletionReasoning: 0,
        tokenCountCompletionAudio: 0,
        tokenCountCompletionImage: 0,
        tokenCountCompletionVideoSeconds: 0,
        tokenCountCompletionVideoTokens: 0,
        totalCost: 0.001,
        totalPrice: 0.002,
    };

    await sendToTinybird(
        event,
        env.TINYBIRD_INGEST_URL,
        env.TINYBIRD_INGEST_TOKEN,
        log,
    );

    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0].id).toBe("test-event-id");
});

test("sendToTinybird handles API errors gracefully", async ({ log, mocks }) => {
    await mocks.enable("tinybird");

    const event = {
        id: "simulate_tinybird_error:test-event-id",
        requestId: "test-request-id",
        requestPath: "/api/generate/openai",
        startTime: new Date(),
        endTime: new Date(Date.now() + 100),
        responseTime: 100,
        responseStatus: 200,
        environment: "test",
        eventType: "generate.text" as const,
        userId: "test-user-id",
        userTier: "seed",
        isBilledUsage: true,
        modelRequested: "openai",
        resolvedModelRequested: "openai",
        modelUsed: "gpt-4o-mini",
        modelProviderUsed: "azure-openai",
        tokenPricePromptText: 0,
        tokenPricePromptCached: 0,
        tokenPricePromptAudio: 0,
        tokenPricePromptImage: 0,
        tokenPriceCompletionText: 0,
        tokenPriceCompletionReasoning: 0,
        tokenPriceCompletionAudio: 0,
        tokenPriceCompletionImage: 0,
        tokenPriceCompletionVideoSeconds: 0,
        tokenPriceCompletionVideoTokens: 0,
        tokenCountPromptText: 100,
        tokenCountPromptCached: 0,
        tokenCountPromptAudio: 0,
        tokenCountPromptImage: 0,
        tokenCountCompletionText: 50,
        tokenCountCompletionReasoning: 0,
        tokenCountCompletionAudio: 0,
        tokenCountCompletionImage: 0,
        tokenCountCompletionVideoSeconds: 0,
        tokenCountCompletionVideoTokens: 0,
        totalCost: 0.001,
        totalPrice: 0.002,
    };

    // Should not throw - fire-and-forget with error logging
    await sendToTinybird(
        event,
        env.TINYBIRD_INGEST_URL,
        env.TINYBIRD_INGEST_TOKEN,
        log,
    );

    // Event should not be in the mock state due to simulated error
    expect(mocks.tinybird.state.events).toHaveLength(0);
});

test("flattenBalances converts meter slugs to balance keys", () => {
    const balances = {
        "v1:meter:tier": 100,
        "v1:meter:pack": 50,
    };

    const flattened = flattenBalances(balances);

    expect(flattened).toEqual({
        pollenTierBalance: 100,
        pollenPackBalance: 50,
    });
});

test("flattenBalances handles null balances", () => {
    const flattened = flattenBalances(null);
    expect(flattened).toEqual({});
});

test("flattenBalances handles empty balances", () => {
    const flattened = flattenBalances({});
    expect(flattened).toEqual({});
});

test("Exponential backoff delay", async () => {
    const backoffConfig = {
        minDelay: 100,
        maxDelay: 10000,
        maxAttempts: 5,
        jitter: 0,
    };
    expect(exponentialBackoffDelay(1, backoffConfig)).toBe(100);
    expect(exponentialBackoffDelay(3, backoffConfig)).toBeGreaterThan(100);
    expect(exponentialBackoffDelay(3, backoffConfig)).toBeLessThan(10000);
    expect(exponentialBackoffDelay(5, backoffConfig)).toBe(10000);
    const backoffConfigWithJitter = {
        minDelay: 100,
        maxDelay: 10000,
        maxAttempts: 5,
        jitter: 0.1,
    };
    expect(
        exponentialBackoffDelay(1, backoffConfigWithJitter),
    ).toBeGreaterThanOrEqual(100 - 100 * 0.1);
    expect(
        exponentialBackoffDelay(1, backoffConfigWithJitter),
    ).toBeLessThanOrEqual(100 + 100 * 0.1);
    expect(
        exponentialBackoffDelay(3, backoffConfigWithJitter),
    ).toBeGreaterThanOrEqual(100 - 100 * 0.1);
    expect(
        exponentialBackoffDelay(3, backoffConfigWithJitter),
    ).toBeLessThanOrEqual(10000 + 10000 * 0.1);
    expect(
        exponentialBackoffDelay(5, backoffConfigWithJitter),
    ).toBeGreaterThanOrEqual(10000 - 10000 * 0.1);
    expect(
        exponentialBackoffDelay(5, backoffConfigWithJitter),
    ).toBeLessThanOrEqual(10000 + 10000 * 0.1);
});
