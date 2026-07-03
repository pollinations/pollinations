import { describe, expect, it } from "vitest";
import { findModelByName } from "../../../src/text/availableModels.js";
import { createGeminiThinkingTransform } from "../../../src/text/transforms/createGeminiThinkingTransform.js";

describe("createGeminiThinkingTransform", () => {
    it("maps reasoning_effort=none to Gemini 2.5 disabled thinking", async () => {
        const transform = createGeminiThinkingTransform("v2.5");
        const { options } = await transform([], { reasoning_effort: "none" });

        expect(options.thinking).toEqual({ budget_tokens: 0 });
        expect(options.reasoning_effort).toBeUndefined();
    });

    it("maps reasoning_effort=medium to Gemini 2.5 budget thinking", async () => {
        const transform = createGeminiThinkingTransform("v2.5");
        const { options } = await transform([], { reasoning_effort: "medium" });

        expect(options.thinking).toEqual({
            type: "enabled",
            budget_tokens: 4096,
        });
        expect(options.reasoning_effort).toBeUndefined();
    });

    it("passes reasoning_effort=none through for Gemini 3 Flash", async () => {
        const transform = createGeminiThinkingTransform("v3-flash");
        const { options } = await transform([], { reasoning_effort: "none" });

        expect(options.reasoning_effort).toBe("none");
        expect(options.thinking).toBeUndefined();
    });

    it("maps reasoning_effort=none to low for Gemini 3 Pro", async () => {
        const transform = createGeminiThinkingTransform("v3-pro");
        const { options } = await transform([], { reasoning_effort: "none" });

        expect(options.reasoning_effort).toBe("low");
        expect(options.thinking).toBeUndefined();
    });
});

describe("Gemini reasoning_effort model wiring", () => {
    it("wires Gemini 2.5 thinking on gemini-fast", async () => {
        const transform = findModelByName("gemini-fast")?.transform;
        if (!transform) throw new Error("gemini-fast transform missing");

        const { options } = await transform([{ role: "user", content: "hi" }], {
            reasoning_effort: "medium",
        });

        expect(options.thinking).toEqual({
            type: "enabled",
            budget_tokens: 4096,
        });
        expect(options.reasoning_effort).toBeUndefined();
    });
});
