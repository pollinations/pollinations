import { describe, expect, it } from "vitest";
import {
    getModelDefinition,
    resolveModelName,
} from "../../shared/registry/registry.ts";
import { OPENCLAW_BACKING_MODEL_ID } from "../../shared/registry/text.ts";
import { findModelByName } from "../availableModels.js";
import { BASE_PROMPTS } from "../prompts/systemPrompts.js";

describe("openclaw regression checks", () => {
    it("keeps registry identity aligned with runtime backing model key", () => {
        const openclawRegistry = getModelDefinition(
            resolveModelName("openclaw"),
        );
        expect(openclawRegistry.modelId).toBe(OPENCLAW_BACKING_MODEL_ID);
    });

    it("keeps runtime openclaw model registered with a transform", () => {
        const modelDef = findModelByName("openclaw");
        expect(modelDef).toBeTruthy();
        expect(typeof modelDef?.transform).toBe("function");
    });

    it("keeps prompt operational constraints for tools/patches/retries", () => {
        const prompt = BASE_PROMPTS.openclaw;
        expect(prompt).toMatch(/Tool-call sequencing/i);
        expect(prompt).toMatch(/Patch\/edit discipline/i);
        expect(prompt).toMatch(/Failure recovery/i);
        expect(prompt).toMatch(/Escalation/i);
    });
});
