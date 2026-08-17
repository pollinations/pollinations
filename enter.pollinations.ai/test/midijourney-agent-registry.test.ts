import { describe, expect, it } from "vitest";
import { modelInfoFromDefinition } from "../../shared/registry/model-info.ts";
import {
    getRegistryModelDefinition,
    resolveModelName,
} from "../../shared/registry/registry.ts";

describe("MIDIjourney agent registry", () => {
    it("publishes one Pollinations agent and keeps the former large ID as an alias", () => {
        expect(resolveModelName("midijourney-large")).toBe("midijourney");

        const definition = getRegistryModelDefinition("midijourney");
        const info = modelInfoFromDefinition("midijourney", definition);

        expect(info).toMatchObject({
            name: "midijourney",
            aliases: ["midijourney-large"],
            brand: "Pollinations",
            agent: true,
            base_model: "gpt-5.6-sol",
            capabilities: ["tool_calling"],
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
