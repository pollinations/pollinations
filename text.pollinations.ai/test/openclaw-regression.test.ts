import assert from "node:assert/strict";
import test from "node:test";
import { getModelDefinition, resolveModelName } from "../../shared/registry/registry.ts";
import { findModelByName } from "../availableModels.js";
import { BASE_PROMPTS } from "../prompts/systemPrompts.js";

test("openclaw registry identity matches runtime backing model key", () => {
    const openclawRegistry = getModelDefinition(resolveModelName("openclaw"));
    assert.equal(openclawRegistry.modelId, "qwen3-coder-30b-a3b-instruct");
});

test("openclaw runtime model exists and uses a transform", () => {
    const modelDef = findModelByName("openclaw");
    assert.ok(modelDef);
    assert.equal(typeof modelDef.transform, "function");
});

test("openclaw prompt includes tool sequencing and failure recovery constraints", () => {
    const prompt = BASE_PROMPTS.openclaw;
    assert.match(prompt, /Tool-call sequencing/i);
    assert.match(prompt, /Patch\/edit discipline/i);
    assert.match(prompt, /Failure recovery/i);
    assert.match(prompt, /Escalation/i);
});
