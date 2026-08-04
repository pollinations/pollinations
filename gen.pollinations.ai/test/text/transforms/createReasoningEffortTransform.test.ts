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
    it("leaves Inkling reasoning and tool schemas to OpenRouter", () => {
        expect(findModelByName("inkling")?.transform).toBeUndefined();
    });

    it.each([
        "z-ai/glm-5.2",
        "moonshotai/kimi-k2.6",
        "moonshotai/kimi-k2.7-code",
        "moonshotai/kimi-k3",
        "deepseek/deepseek-v4-flash-0731",
        "qwen/qwen3.7-plus",
        "qwen/qwen3.7-flash",
        "meituan/longcat-2.0",
        "nvidia/nemotron-3-ultra-550b-a55b",
        "minimax/minimax-m3",
    ])("disables thinking via reasoning_effort=none on %s", async (modelName) => {
        const transform = findModelByName(modelName)?.transform;
        if (!transform) throw new Error(`${modelName} transform missing`);
        const { options } = await transform([{ role: "user", content: "hi" }], {
            reasoning_effort: "none",
        });
        expect(options.reasoning_effort).toBe("none");
    });

    it.each([
        "minimax/minimax-m2.7",
        "stepfun/step-3.5-flash",
        "stepfun/step-3.7-flash",
        "qwen/qwen3-vl-235b-a22b-thinking",
    ])("drops off-value on mandatory-reasoning model %s", async (modelName) => {
        const transform = findModelByName(modelName)?.transform;
        if (!transform) throw new Error(`${modelName} transform missing`);
        const { options } = await transform([{ role: "user", content: "hi" }], {
            reasoning_effort: "none",
        });
        expect(options.reasoning_effort).toBeUndefined();
    });

    it.each([
        "mistralai/mistral-large-2512",
        "meta-llama/llama-3.3-70b-instruct",
        "qwen/qwen3-coder-30b-a3b-instruct",
    ])("strips reasoning_effort on non-reasoning model %s", async (modelName) => {
        const transform = findModelByName(modelName)?.transform;
        if (!transform) throw new Error(`${modelName} transform missing`);
        const { options } = await transform([{ role: "user", content: "hi" }], {
            reasoning_effort: "high",
        });
        expect(options.reasoning_effort).toBeUndefined();
    });

    it("passes Command A+ requests through without a model-specific transform", () => {
        expect(
            findModelByName("command-a-plus-05-2026")?.transform,
        ).toBeUndefined();
    });
});
