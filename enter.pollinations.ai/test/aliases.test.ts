import { AUDIO_SERVICES } from "@shared/registry/audio";
import { IMAGE_SERVICES } from "@shared/registry/image";
import type { ModelDefinition } from "@shared/registry/registry.js";
import {
    calculateCost,
    calculatePrice,
    getCostDefinition,
    getModelDefinition,
    getModels,
    getPriceDefinition,
    resolveModelName,
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

test("public price equals provider cost times priceMultiplier for every model", () => {
    // Invariant: price = cost × priceMultiplier, for every model, no exceptions.
    // Asserted per cost field so it holds at any multiplier (currently all 1×).
    for (const model of getModels()) {
        const cost = getCostDefinition(model);
        const price = getPriceDefinition(model);
        if (!cost || !price) continue; // no cost block → nothing billed
        const { priceMultiplier } = getModelDefinition(model);
        for (const [field, rate] of Object.entries(cost)) {
            const priceRate = price[field as keyof typeof price] as number;
            expect(priceRate).toBeCloseTo(
                (rate as number) * priceMultiplier,
                15,
            );
        }
    }
});

test("model without explicit price falls back to cost for both values", () => {
    const usage = { completionImageTokens: 1 };
    const cost = calculateCost("flux", usage);
    const price = calculatePrice("flux", usage);

    expect(price.totalPrice).toBeCloseTo(cost.totalCost, 8);
});

test("GPT-5.5 is available on the free tier", () => {
    const definition = getModelDefinition("gpt-5.5");

    expect(definition.paidOnly).toBeUndefined();
});

test("DeepSeek V4 models are billed at provider cost", () => {
    const usage = {
        promptTextTokens: 1_000_000,
        promptCachedTokens: 1_000_000,
        completionTextTokens: 1_000_000,
    };

    const expectedCosts = {
        // biome-ignore lint/suspicious/noApproximativeNumericConstant: expected DeepSeek price for the fixed usage vector.
        deepseek: 0.434,
        "deepseek-pro": 5.36,
    } as const;
    const expectedProviders = {
        deepseek: "fireworks",
        "deepseek-pro": "fireworks",
    } as const;
    const expectedPaidOnly = {
        deepseek: undefined,
        "deepseek-pro": undefined,
    } as const;

    for (const model of ["deepseek", "deepseek-pro"] as const) {
        const definition = getModelDefinition(model);
        const cost = calculateCost(model, usage);
        const price = calculatePrice(model, usage);

        expect(definition.provider).toBe(expectedProviders[model]);
        expect(definition.paidOnly).toBe(expectedPaidOnly[model]);
        expect(cost.totalCost).toBeCloseTo(expectedCosts[model], 8);
        expect(price.totalPrice).toBeCloseTo(cost.totalCost, 8);
    }
});
