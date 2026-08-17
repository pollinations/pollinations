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

        expect(definition).toMatchObject({
            provider: "azure",
            category: "text",
            priceMultiplier: 0.5,
            agent: true,
            baseModel: "gpt-5.6-sol",
        });
        expect(definition.inputModalities).toBeUndefined();
        expect(definition.outputModalities).toBeUndefined();
        expect(definition.tools).toBeUndefined();
        expect(definition.reasoning).toBeUndefined();
        expect(definition.contextLength).toBeUndefined();

        expect(info).toMatchObject({
            name: "midijourney",
            aliases: [],
            brand: "Pollinations",
            agent: true,
            base_model: "gpt-5.6-sol",
            pricing: {
                currency: "pollen",
                promptTextTokens: "0.0000025",
                promptCachedTokens: "0.00000025",
                promptCacheWriteTokens: "0.000003125",
                completionTextTokens: "0.000015",
            },
        });
        expect(info.capabilities).toEqual([]);
        expect(info.context_length).toBeUndefined();
        expect(info.brand_url).toBeUndefined();
    });
});
