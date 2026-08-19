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

    it("passes the budget through unchanged regardless of max_tokens", async () => {
        // Thin proxy: don't shrink the budget to fit max_tokens — if it
        // exceeds max_tokens, Bedrock returns its own clear 400.
        const { options } = await budget([], {
            reasoning_effort: "high",
            max_tokens: 3000,
        });
        expect(options.thinking).toEqual({
            type: "enabled",
            budget_tokens: 4096,
        });
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
        const { options } = await adaptive([], { reasoning_effort: "medium" });
        expect(options.thinking).toEqual({ type: "adaptive" });
        expect(JSON.stringify(options)).not.toContain("budget_tokens");
    });
});

describe("createClaudeThinkingTransform — adaptive mode with upstream default on", () => {
    const adaptiveDefaultOff = createClaudeThinkingTransform("adaptive", true);

    it("explicitly disables thinking by default", async () => {
        const { options } = await adaptiveDefaultOff([], {});
        expect(options.thinking).toEqual({ type: "disabled" });
        expect(options.output_config).toBeUndefined();
    });

    it("explicitly disables thinking for reasoning_effort=none", async () => {
        const { options } = await adaptiveDefaultOff([], {
            reasoning_effort: "none",
        });
        expect(options.thinking).toEqual({ type: "disabled" });
        expect(options.reasoning_effort).toBeUndefined();
    });

    it("enables adaptive thinking when requested", async () => {
        const { options } = await adaptiveDefaultOff([], {
            reasoning_effort: "high",
        });
        expect(options.thinking).toEqual({ type: "adaptive" });
        expect(options.output_config).toEqual({ effort: "high" });
    });
});

describe("Claude thinking model wiring", () => {
    it("wires budget thinking on claude-fast", async () => {
        const transform = findModelByName(
            "anthropic/claude-haiku-4.5",
        )?.transform;
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
        "anthropic/claude-sonnet-4.6",
        "anthropic/claude-opus-4.6",
        "anthropic/claude-opus-5",
        "anthropic/claude-opus-4.7",
        "anthropic/claude-fable-5",
    ])("wires adaptive thinking on %s", async (modelName) => {
        const transform = findModelByName(modelName)?.transform;
        if (!transform) throw new Error(`${modelName} transform missing`);
        const { options } = await transform([{ role: "user", content: "hi" }], {
            reasoning_effort: "high",
        });
        expect(options.thinking).toEqual({ type: "adaptive" });
        expect(options.output_config).toEqual({ effort: "high" });
    });

    it("keeps claude-large reasoning opt-in", async () => {
        const transform = findModelByName("anthropic/claude-opus-5")?.transform;
        if (!transform) throw new Error("claude-large transform missing");
        const { options } = await transform(
            [{ role: "user", content: "hi" }],
            {},
        );
        expect(options.thinking).toEqual({ type: "disabled" });
    });
});
