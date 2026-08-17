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
        expect(info.brand_url).toBeUndefined();
    });
});
