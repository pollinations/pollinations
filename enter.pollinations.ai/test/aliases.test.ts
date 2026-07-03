import { AUDIO_SERVICES } from "@shared/registry/audio";
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

test("gemini-search applies grounding cost on top of shared token rates", () => {
    const usage = {
        promptTextTokens: 1_000_000,
        completionTextTokens: 1_000_000,
    };
    const geminiFastCost = calculateCost("gemini-fast", usage);
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
    const { priceMultiplier } = getRegistryModelDefinition("flux");
    const cost = calculateCost("flux", usage);
    const price = calculatePrice("flux", usage);

    expect(price.totalPrice).toBeCloseTo(cost.totalCost * priceMultiplier, 8);
});

test("GPT-5.5 is available on the free tier", () => {
    // GPT-5.5 is the flagship behind the `openai-large` clean slug; `gpt-5.5`
    // remains a back-compat alias. Resolve before the direct registry lookup.
    const definition = getRegistryModelDefinition(resolveModelName("gpt-5.5"));

    expect(definition.paidOnly).toBeUndefined();
});

test("DeepSeek V4 models are billed at provider cost", () => {
    const usage = {
        promptTextTokens: 1_000_000,
        promptCachedTokens: 1_000_000,
        completionTextTokens: 1_000_000,
    };

    const expectedProviders = {
        deepseek: "fireworks",
        "deepseek-pro": "fireworks",
    } as const;
    const expectedPaidOnly = {
        deepseek: undefined,
        "deepseek-pro": undefined,
    } as const;

    for (const model of ["deepseek", "deepseek-pro"] as const) {
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
