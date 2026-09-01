import { describe, expect, it } from "vitest";
import { findModelByName } from "../../../src/text/availableModels.js";

const messages = [
    {
        role: "user" as const,
        content: [
            {
                type: "text",
                text: "hi",
                cache_control: { type: "ephemeral" },
            },
        ],
    },
];

describe("provider transform passthrough", () => {
    it.each([
        "qwen3.8-2.4t-a95b",
        "mistral-small-3.2",
        "grok",
        "kimi",
        "kimi-code",
        "kimi-k3",
        "thinkingmachines/inkling",
        "nemotron-3.5-lightning",
        "glm",
        "glm-5.3",
        "z-ai/glm-5.3-flash",
    ])("preserves cache_control for %s", async (modelName) => {
        const transform = findModelByName(modelName)?.transform;
        if (!transform) throw new Error(`${modelName} transform missing`);

        const result = await transform(messages, {});

        expect(result.messages).toEqual(messages);
    });

    it.each([
        "mistral",
        "grok-large",
        "grok-4.6",
        "mimo-v2.5",
        "mimo-v2.5-pro",
    ])("does not transform %s requests", (modelName) => {
        expect(findModelByName(modelName)?.transform).toBeUndefined();
    });
});
