import { AUDIO_SERVICES } from "@shared/registry/audio";
import { EMBEDDING_SERVICES } from "@shared/registry/embeddings";
import { IMAGE_SERVICES } from "@shared/registry/image";
import type { ModelDefinition } from "@shared/registry/registry.js";
import {
    calculateCost,
    calculatePrice,
    getCostDefinition,
    getModels,
    getPriceDefinition,
    getRegistryModelDefinition,
    type ModelName,
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

test("aliases are unique and never collide with canonical model names", () => {
    const seen = new Map<string, string>();
    for (const model of getModels()) seen.set(model, model);

    for (const model of getModels()) {
        for (const alias of getRegistryModelDefinition(model).aliases) {
            expect(
                seen.get(alias),
                `alias "${alias}" of ${model} collides with ${seen.get(alias)}`,
            ).toBeUndefined();
            seen.set(alias, model);
        }
    }
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
                    webSearchQueries: ["latest Gemini pricing"],
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
    const { priceMultiplier } = getRegistryModelDefinition(
        "black-forest-labs/flux.1-schnell",
    );
    const cost = calculateCost("black-forest-labs/flux.1-schnell", usage);
    const price = calculatePrice("black-forest-labs/flux.1-schnell", usage);

    expect(price.totalPrice).toBeCloseTo(cost.totalCost * priceMultiplier, 8);
});

test("GPT-5.5 is available without paid-only gating", () => {
    const definition = getRegistryModelDefinition(
        resolveModelName("openai-large"),
    );

    expect(definition.paidOnly).toBeUndefined();
});

test("GPT-5.6 models are quest-eligible at the promotional multiplier", () => {
    for (const model of [
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna",
    ] as const) {
        const definition = getRegistryModelDefinition(model);

        expect(definition.provider).toBe("azure");
        expect(definition.paidOnly).toBeUndefined();
        expect(definition.priceMultiplier).toBe(0.5);
    }
});

test("Seedream 5 Pro uses Replicate and requires paid balance at provider cost", () => {
    const definition = getRegistryModelDefinition("bytedance/seedream-5-pro");

    expect(definition.provider).toBe("replicate");
    expect(definition.paidOnly).toBe(true);
    expect(definition.priceMultiplier).toBe(1);
});

test("DeepSeek V4 models are billed at provider cost", () => {
    const usage = {
        promptTextTokens: 1_000_000,
        promptCachedTokens: 1_000_000,
        completionTextTokens: 1_000_000,
    };

    const expectedProviders = {
        "deepseek/deepseek-v4-flash": "fireworks",
        "deepseek/deepseek-v4-pro": "fireworks",
    } as const;
    const expectedPaidOnly = {
        "deepseek/deepseek-v4-flash": undefined,
        "deepseek/deepseek-v4-pro": undefined,
    } as const;

    for (const model of [
        "deepseek/deepseek-v4-flash",
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
