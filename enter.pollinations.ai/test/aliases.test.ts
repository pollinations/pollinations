import { AUDIO_SERVICES } from "@shared/registry/audio";
import { IMAGE_SERVICES } from "@shared/registry/image";
import type { ModelDefinition } from "@shared/registry/registry.js";
import {
    calculateCost,
    calculatePrice,
    getBasePriceMultiplier,
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

test("public price equals provider cost times base priceMultiplier for every model", () => {
    // The static price table is derived from base cost × base multiplier.
    // Dynamic functors add runtime adjustments in calculateCost/calculatePrice.
    for (const model of getModels()) {
        const cost = getCostDefinition(model);
        const price = getPriceDefinition(model);
        if (!cost || !price) continue; // no cost block → nothing billed
        const priceMultiplier = getBasePriceMultiplier(
            getModelDefinition(model),
        );
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
    const priceMultiplier = getBasePriceMultiplier(getModelDefinition("flux"));
    const cost = calculateCost("flux", usage);
    const price = calculatePrice("flux", usage);

    expect(price.totalPrice).toBeCloseTo(cost.totalCost * priceMultiplier, 8);
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
