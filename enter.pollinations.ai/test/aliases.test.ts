import { AUDIO_SERVICES } from "@shared/registry/audio";
import { EMBEDDING_SERVICES } from "@shared/registry/embeddings";
import { IMAGE_SERVICES } from "@shared/registry/image";
import { REALTIME_SERVICES } from "@shared/registry/realtime";
import type { ModelDefinition } from "@shared/registry/registry.js";
import {
    calculateCost,
    calculatePrice,
    getCostDefinition,
    getModels,
    getPriceDefinition,
    getRegistryModelDefinition,
    type ModelName,
    normalizeModelAllowlist,
    resolveModelName,
    type UsageType,
} from "@shared/registry/registry.js";
import { TEXT_SERVICES } from "@shared/registry/text";
import { expect, test } from "vitest";

function serviceAliasTestCases(
    services: Record<string, ModelDefinition>,
): string[][] {
    return Object.entries(services).flatMap(([serviceId, serviceDefinition]) =>
        serviceDefinition.aliases.map((alias) => [alias, serviceId]),
    );
}

function requiredCostRate(model: ModelName, field: UsageType): number {
    const rate = getCostDefinition(model)?.[field];

    expect(rate, `${model}.${field} must have a configured cost`).toEqual(
        expect.any(Number),
    );
    expect(rate).toBeGreaterThan(0);

    return rate as number;
}

test.for(
    serviceAliasTestCases(TEXT_SERVICES),
)("Text service alias %s is resolved to %s", ([alias, shouldResolveTo]) => {
    const resolved = resolveModelName(alias);
    expect(resolved).toBe(shouldResolveTo);
});

test.for(
    serviceAliasTestCases(IMAGE_SERVICES),
)("Image service alias %s is resolved to %s", ([alias, shouldResolveTo]) => {
    const resolved = resolveModelName(alias);
    expect(resolved).toBe(shouldResolveTo);
});

test.for(
    serviceAliasTestCases(AUDIO_SERVICES),
)("Audio service alias %s is resolved to %s", ([alias, shouldResolveTo]) => {
    const resolved = resolveModelName(alias);
    expect(resolved).toBe(shouldResolveTo);
});

test.for(
    serviceAliasTestCases(EMBEDDING_SERVICES),
)("Embedding service alias %s is resolved to %s", ([
    alias,
    shouldResolveTo,
]) => {
    const resolved = resolveModelName(alias);
    expect(resolved).toBe(shouldResolveTo);
});

test.for(
    serviceAliasTestCases(REALTIME_SERVICES),
)("Realtime service alias %s is resolved to %s", ([alias, shouldResolveTo]) => {
    const resolved = resolveModelName(alias);
    expect(resolved).toBe(shouldResolveTo);
});

test("model allowlists store canonical IDs and preserve unknown IDs", () => {
    expect(
        normalizeModelAllowlist([
            "flux",
            "black-forest-labs/FLUX.1-schnell",
            "nanobanana2",
            "owner/community-model",
        ]),
    ).toEqual([
        "black-forest-labs/FLUX.1-schnell",
        "google/gemini-3.1-flash-image",
        "owner/community-model",
    ]);
});

test("gemini-search applies grounding cost on top of shared token rates", () => {
    const usage = {
        promptTextTokens: 1_000_000,
        completionTextTokens: 1_000_000,
    };
    const geminiFastCost = calculateCost("google/gemini-2.5-flash-lite", usage);
    const geminiSearchCost = calculateCost("gemini-search", usage, {
        choices: [
            {
                groundingMetadata: {
                    webSearchQueries: ["current news"],
                },
            },
        ],
    });

    expect(geminiSearchCost.totalCost).toBeGreaterThan(
        geminiFastCost.totalCost,
    );
});

test("public price equals provider cost times priceMultiplier for every model", () => {
    // Invariant: price = cost × priceMultiplier, for every model, no exceptions.
    // Asserted per cost field so it holds at any multiplier (currently all 1×).
    for (const model of getModels()) {
        const cost = getCostDefinition(model);
        const price = getPriceDefinition(model);
        if (!cost || !price) continue; // no cost block → nothing billed
        const { priceMultiplier } = getRegistryModelDefinition(model);
        for (const [field, rate] of Object.entries(cost)) {
            const priceRate = price[field as keyof typeof price] as number;
            expect(priceRate).toBeCloseTo(
                (rate as number) * priceMultiplier,
                15,
            );
        }
    }
});

test("calculatePrice derives the total from cost via priceMultiplier", () => {
    // No model carries an explicit price block — price is always derived from
    // cost × priceMultiplier. Assert the runtime aggregation honours that for a
    // single-field model, at whatever multiplier the model currently uses.
    const usage = { completionImageTokens: 1 };
    const model = "black-forest-labs/FLUX.1-schnell";
    const { priceMultiplier } = getRegistryModelDefinition(model);
    const cost = calculateCost(model, usage);
    const price = calculatePrice(model, usage);

    expect(price.totalPrice).toBeCloseTo(cost.totalCost * priceMultiplier, 8);
});

test("GPT-5.5 is available without paid-only gating", () => {
    const definition = getRegistryModelDefinition("openai/gpt-5.5");

    expect(definition.paidOnly).toBeUndefined();
});

test("GPT-5.6 models are quest-eligible at the promotional multiplier", () => {
    for (const model of [
        "openai/gpt-5.6-sol",
        "openai/gpt-5.6-terra",
        "openai/gpt-5.6-luna",
    ] as const) {
        const definition = getRegistryModelDefinition(model);

        expect(definition.provider).toBe("azure");
        expect(definition.paidOnly).toBeUndefined();
        expect(definition.priceMultiplier).toBe(
            model === "openai/gpt-5.6-luna" ? 0.2 : 0.5,
        );
    }
});

test("Seedream 5 Pro uses Replicate and requires paid balance at provider cost", () => {
    const definition = getRegistryModelDefinition("bytedance/seedream-5-pro");

    expect(definition.provider).toBe("replicate");
    expect(definition.paidOnly).toBe(true);
    expect(definition.priceMultiplier).toBe(1);
});

test("Amazon Nova media models use the Bedrock registry provider", () => {
    for (const model of [
        "amazon.nova-canvas-v1:0",
        "amazon.nova-reel-v1:1",
    ] as const) {
        expect(getRegistryModelDefinition(model).provider).toBe("bedrock");
    }
});

test("DeepSeek V4 models are billed at provider cost", () => {
    const usage = {
        promptTextTokens: 1_000_000,
        promptCachedTokens: 1_000_000,
        completionTextTokens: 1_000_000,
    };

    const expectedProviders = {
        "deepseek/deepseek-v4-flash-0731": "fireworks",
        "deepseek/deepseek-v4-pro": "fireworks",
    } as const;
    const expectedPaidOnly = {
        "deepseek/deepseek-v4-flash-0731": undefined,
        "deepseek/deepseek-v4-pro": undefined,
    } as const;

    for (const model of [
        "deepseek/deepseek-v4-flash-0731",
        "deepseek/deepseek-v4-pro",
    ] as const) {
        const definition = getRegistryModelDefinition(model);
        const cost = calculateCost(model, usage);
        const price = calculatePrice(model, usage);
        const expectedCost =
            requiredCostRate(model, "promptTextTokens") *
                usage.promptTextTokens +
            requiredCostRate(model, "promptCachedTokens") *
                usage.promptCachedTokens +
            requiredCostRate(model, "completionTextTokens") *
                usage.completionTextTokens;

        expect(definition.provider).toBe(expectedProviders[model]);
        expect(definition.paidOnly).toBe(expectedPaidOnly[model]);
        expect(cost.totalCost).toBeCloseTo(expectedCost, 8);
        expect(price.totalPrice).toBeCloseTo(cost.totalCost, 8);
    }
});
