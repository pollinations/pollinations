import { describe, expect, it } from "vitest";
import { findModelByName } from "../../../src/text/availableModels.js";
import { createReasoningEffortTransform } from "../../../src/text/transforms/createReasoningEffortTransform.js";

describe("createReasoningEffortTransform — toggle", () => {
    const toggle = createReasoningEffortTransform("toggle");

    it("normalizes minimal to none (Fireworks rejects minimal)", async () => {
        const { options } = await toggle([], { reasoning_effort: "minimal" });
        expect(options.reasoning_effort).toBe("none");
    });

    it("passes none through unchanged", async () => {
        const { options } = await toggle([], { reasoning_effort: "none" });
        expect(options.reasoning_effort).toBe("none");
    });

    it("leaves on-levels untouched", async () => {
        const { options } = await toggle([], { reasoning_effort: "high" });
        expect(options.reasoning_effort).toBe("high");
    });

    it("is a no-op when nothing reasoning-related is set", async () => {
        const { options } = await toggle([], { temperature: 0.5 });
        expect(options.reasoning_effort).toBeUndefined();
        expect(options.temperature).toBe(0.5);
    });
});

describe("createReasoningEffortTransform — mandatory", () => {
    const mandatory = createReasoningEffortTransform("mandatory");

    it("drops none (model rejects it, reasoning stays on)", async () => {
        const { options } = await mandatory([], { reasoning_effort: "none" });
        expect(options.reasoning_effort).toBeUndefined();
    });

    it("maps minimal to low", async () => {
        const { options } = await mandatory([], {
            reasoning_effort: "minimal",
        });
        expect(options.reasoning_effort).toBe("low");
    });

    it("keeps low/medium/high", async () => {
        const { options } = await mandatory([], { reasoning_effort: "medium" });
        expect(options.reasoning_effort).toBe("medium");
    });

    it("normalizes xhigh to high", async () => {
        const { options } = await mandatory([], { reasoning_effort: "xhigh" });
        expect(options.reasoning_effort).toBe("high");
    });
});

describe("createReasoningEffortTransform — strip", () => {
    const strip = createReasoningEffortTransform("strip");

    it("removes reasoning_effort entirely", async () => {
        const { options } = await strip([], {
            reasoning_effort: "high",
            temperature: 0.7,
        });
        expect(options.reasoning_effort).toBeUndefined();
        expect(options.temperature).toBe(0.7);
    });

    it("passes messages through untouched", async () => {
        const messages = [{ role: "user" as const, content: "hi" }];
        const { messages: result } = await strip(messages, {
            reasoning_effort: "high",
        });
        expect(result).toBe(messages);
    });
});

describe("reasoning_effort model wiring", () => {
    it.each([
        "glm",
        "kimi",
        "kimi-code",
        "deepseek",
        "qwen-large",
        "minimax",
    ])("disables thinking via reasoning_effort=none on %s", async (modelName) => {
        const transform = findModelByName(modelName)?.transform;
        if (!transform) throw new Error(`${modelName} transform missing`);
        const { options } = await transform([{ role: "user", content: "hi" }], {
            reasoning_effort: "none",
        });
        expect(options.reasoning_effort).toBe("none");
    });

    it.each([
        "minimax-m2.7",
        "step-3.5-flash",
        "step-flash",
        "qwen-vision-pro",
    ])("drops off-value on mandatory-reasoning model %s", async (modelName) => {
        const transform = findModelByName(modelName)?.transform;
        if (!transform) throw new Error(`${modelName} transform missing`);
        const { options } = await transform([{ role: "user", content: "hi" }], {
            reasoning_effort: "none",
        });
        expect(options.reasoning_effort).toBeUndefined();
    });

    it.each([
        "grok",
        "mistral-large",
        "llama",
        "qwen-coder",
    ])("strips reasoning_effort on non-reasoning model %s", async (modelName) => {
        const transform = findModelByName(modelName)?.transform;
        if (!transform) throw new Error(`${modelName} transform missing`);
        const { options } = await transform([{ role: "user", content: "hi" }], {
            reasoning_effort: "high",
        });
        expect(options.reasoning_effort).toBeUndefined();
    });
});
