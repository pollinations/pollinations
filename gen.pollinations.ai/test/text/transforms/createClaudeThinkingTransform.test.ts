import { describe, expect, it } from "vitest";
import { findModelByName } from "../../../src/text/availableModels.js";
import { createClaudeThinkingTransform } from "../../../src/text/transforms/createClaudeThinkingTransform.js";

describe("createClaudeThinkingTransform — budget mode (Haiku 4.5)", () => {
    const budget = createClaudeThinkingTransform("budget");

    it("is off by default (no thinking block)", async () => {
        const { options } = await budget([], {});
        expect(options.thinking).toBeUndefined();
    });

    it("stays off for reasoning_effort=none", async () => {
        const { options } = await budget([], { reasoning_effort: "none" });
        expect(options.thinking).toBeUndefined();
    });

    it("stays off for thinking_budget=0", async () => {
        const { options } = await budget([], { thinking_budget: 0 });
        expect(options.thinking).toBeUndefined();
        expect(options.thinking_budget).toBeUndefined();
    });

    it("maps reasoning_effort=high to enabled thinking with a budget", async () => {
        const { options } = await budget([], { reasoning_effort: "high" });
        expect(options.thinking).toEqual({
            type: "enabled",
            budget_tokens: 4096,
        });
        expect(options.reasoning_effort).toBeUndefined();
    });

    it("maps reasoning_effort=minimal to the lowest enabled budget", async () => {
        const { options } = await budget([], { reasoning_effort: "minimal" });
        expect(options.thinking).toEqual({
            type: "enabled",
            budget_tokens: 1024,
        });
    });

    it("uses an explicit thinking_budget verbatim", async () => {
        const { options } = await budget([], { thinking_budget: 6000 });
        expect(options.thinking).toEqual({
            type: "enabled",
            budget_tokens: 6000,
        });
    });

    it("clamps budget below max_tokens", async () => {
        const { options } = await budget([], {
            reasoning_effort: "high",
            max_tokens: 3000,
        });
        expect(options.thinking).toEqual({
            type: "enabled",
            budget_tokens: 2999,
        });
    });

    it("skips thinking when max_tokens is too small for the minimum budget", async () => {
        const { options } = await budget([], {
            reasoning_effort: "high",
            max_tokens: 512,
        });
        expect(options.thinking).toBeUndefined();
    });

    it("strips temperature/top_p/top_k when thinking is enabled", async () => {
        const { options } = await budget([], {
            reasoning_effort: "medium",
            temperature: 0.7,
            top_p: 0.9,
        });
        expect(options.thinking).toEqual({
            type: "enabled",
            budget_tokens: 2048,
        });
        expect(options.temperature).toBeUndefined();
        expect(options.top_p).toBeUndefined();
    });

    it("leaves temperature untouched when thinking is off", async () => {
        const { options } = await budget([], {
            reasoning_effort: "none",
            temperature: 0.7,
        });
        expect(options.temperature).toBe(0.7);
    });
});

describe("createClaudeThinkingTransform — adaptive mode (Sonnet 4.6 and Opus 4.6+)", () => {
    const adaptive = createClaudeThinkingTransform("adaptive");

    it("is off by default", async () => {
        const { options } = await adaptive([], {});
        expect(options.thinking).toBeUndefined();
        expect(options.output_config).toBeUndefined();
    });

    it("maps reasoning_effort=high to adaptive thinking + output_config.effort", async () => {
        const { options } = await adaptive([], { reasoning_effort: "high" });
        expect(options.thinking).toEqual({ type: "adaptive" });
        expect(options.output_config).toEqual({ effort: "high" });
    });

    it("maps reasoning_effort=minimal to adaptive low effort", async () => {
        const { options } = await adaptive([], { reasoning_effort: "minimal" });
        expect(options.thinking).toEqual({ type: "adaptive" });
        expect(options.output_config).toEqual({ effort: "low" });
    });

    it("never emits budget_tokens (rejected by Opus 4.7/4.8)", async () => {
        const { options } = await adaptive([], { thinking_budget: 5000 });
        expect(options.thinking).toEqual({ type: "adaptive" });
        expect(JSON.stringify(options)).not.toContain("budget_tokens");
    });
});

describe("Claude thinking model wiring", () => {
    it("wires budget thinking on claude-fast", async () => {
        const transform = findModelByName("claude-fast")?.transform;
        if (!transform) throw new Error("claude-fast transform missing");
        const { options } = await transform([{ role: "user", content: "hi" }], {
            reasoning_effort: "high",
        });
        expect(options.thinking).toEqual({
            type: "enabled",
            budget_tokens: 4096,
        });
    });

    it.each([
        "claude",
        "claude-opus-4.6",
        "claude-large",
        "claude-opus-4.7",
    ])("wires adaptive thinking on %s", async (modelName) => {
        const transform = findModelByName(modelName)?.transform;
        if (!transform) throw new Error(`${modelName} transform missing`);
        const { options } = await transform([{ role: "user", content: "hi" }], {
            reasoning_effort: "high",
        });
        expect(options.thinking).toEqual({ type: "adaptive" });
        expect(options.output_config).toEqual({ effort: "high" });
    });
});
