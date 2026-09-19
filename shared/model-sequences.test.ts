import { describe, expect, it } from "vitest";
import {
    isSequenceFallbackBalanceAllowed,
    isSequenceFallbackPricingAllowed,
    modelSequenceModelId,
    parseModelSequenceId,
} from "./model-sequences.ts";
import type { ModelDefinition } from "./registry/registry.ts";

function definition(
    overrides: Partial<ModelDefinition> & { cost: ModelDefinition["cost"] },
): ModelDefinition {
    return {
        aliases: [],
        provider: "test",
        publisher: "Test",
        category: "text",
        priceMultiplier: 1,
        addedDate: 0,
        title: "Test",
        ...overrides,
    };
}

describe("modelSequenceModelId / parseModelSequenceId", () => {
    it("round-trips owner/name ids", () => {
        const id = modelSequenceModelId("octocat", "my-chain");
        expect(id).toBe("octocat/my-chain");
        expect(parseModelSequenceId(id)).toEqual({
            ownerGithubUsername: "octocat",
            name: "my-chain",
        });
    });

    it("rejects ids without a single separating slash", () => {
        expect(parseModelSequenceId("openai")).toBeNull();
        expect(parseModelSequenceId("/name")).toBeNull();
        expect(parseModelSequenceId("owner/")).toBeNull();
        expect(parseModelSequenceId("owner/name/extra")).toBeNull();
    });
});

describe("isSequenceFallbackPricingAllowed", () => {
    it("allows a fallback priced at or below the primary per usage type", () => {
        const primary = definition({
            cost: { promptTextTokens: 0.01, completionTextTokens: 0.02 },
        });
        const target = definition({
            cost: { promptTextTokens: 0.005, completionTextTokens: 0.02 },
        });
        expect(isSequenceFallbackPricingAllowed(primary, target)).toBe(true);
    });

    it("rejects a fallback with any rate above the primary", () => {
        const primary = definition({
            cost: { promptTextTokens: 0.01, completionTextTokens: 0.02 },
        });
        const target = definition({
            cost: { promptTextTokens: 0.01, completionTextTokens: 0.03 },
        });
        expect(isSequenceFallbackPricingAllowed(primary, target)).toBe(false);
    });

    it("applies each definition's own price multiplier", () => {
        const primary = definition({
            priceMultiplier: 2,
            cost: { completionTextTokens: 0.01 },
        });
        const target = definition({
            priceMultiplier: 1,
            cost: { completionTextTokens: 0.015 },
        });
        expect(isSequenceFallbackPricingAllowed(primary, target)).toBe(true);
    });

    it("rejects a paid rate the primary does not price at all", () => {
        const primary = definition({ cost: { promptTextTokens: 0.01 } });
        const target = definition({
            cost: { promptTextTokens: 0.001, completionTextTokens: 0.001 },
        });
        expect(isSequenceFallbackPricingAllowed(primary, target)).toBe(false);
    });
});

describe("isSequenceFallbackBalanceAllowed", () => {
    it("allows free fallbacks everywhere and paid fallbacks only under paid primaries", () => {
        const free = definition({ cost: {}, paidOnly: false });
        const paid = definition({ cost: {}, paidOnly: true });
        expect(isSequenceFallbackBalanceAllowed(free, free)).toBe(true);
        expect(isSequenceFallbackBalanceAllowed(paid, free)).toBe(true);
        expect(isSequenceFallbackBalanceAllowed(paid, paid)).toBe(true);
        expect(isSequenceFallbackBalanceAllowed(free, paid)).toBe(false);
    });
});
