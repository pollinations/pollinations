import { describe, expect, it } from "vitest";
import { modelInfoFromDefinition } from "../../shared/registry/model-info.ts";
import {
    getRegistryModelDefinition,
    resolveModelName,
} from "../../shared/registry/registry.ts";

describe("MIDIjourney agent registry", () => {
    it("publishes one canonical Pollinations agent without a legacy alias", () => {
        expect(() => resolveModelName("midijourney-large")).toThrow(
            'Invalid model or alias: "midijourney-large"',
        );

        const definition = getRegistryModelDefinition("midijourney");
        const baseDefinition = getRegistryModelDefinition("gpt-5.6-sol");
        const info = modelInfoFromDefinition("midijourney", definition);

        expect(definition.cost).toBe(baseDefinition.cost);
        expect(definition.costVariants).toBe(baseDefinition.costVariants);
        expect(definition.provider).toBe(baseDefinition.provider);
        expect(definition.category).toBe(baseDefinition.category);
        expect(definition.priceMultiplier).toBe(baseDefinition.priceMultiplier);
        expect(definition.inputModalities).toBe(baseDefinition.inputModalities);
        expect(definition.outputModalities).toBe(
            baseDefinition.outputModalities,
        );
        expect(definition.tools).toBe(baseDefinition.tools);
        expect(definition.reasoning).toBe(baseDefinition.reasoning);
        expect(definition.contextLength).toBe(baseDefinition.contextLength);

        expect(definition).toMatchObject({
            brand: "Pollinations",
            title: "MIDI Journey",
            agent: true,
            baseModel: "gpt-5.6-sol",
        });

        expect(info).toMatchObject({
            name: "midijourney",
            aliases: [],
            brand: "Pollinations",
            agent: true,
            base_model: "gpt-5.6-sol",
            capabilities: ["tool_calling", "reasoning"],
            context_length: 1050000,
            pricing: {
                currency: "pollen",
                promptTextTokens: "0.0000025",
                promptCachedTokens: "0.00000025",
                promptCacheWriteTokens: "0.000003125",
                completionTextTokens: "0.000015",
            },
        });
        expect(info).not.toHaveProperty("is_specialized");
        expect(info.brand_url).toBeUndefined();
    });
});
