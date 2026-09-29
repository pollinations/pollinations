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
        "mistral-small-3.2",
        "grok",
        "kimi",
        "kimi-code",
        "glm",
        "inception/mercury-2.5-preview",
    ])("preserves cache_control for %s", async (modelName) => {
        const transform = findModelByName(modelName)?.transform;
        if (!transform) throw new Error(`${modelName} transform missing`);

        const result = await transform(messages, {});

        expect(result.messages).toEqual(messages);
    });

    it.each([
        "qwen/qwen3.8-2.4t-a95b",
        "deepseek/deepseek-v4.1-flash",
        "moonshotai/kimi-k3",
        "thinkingmachines/inkling",
        "nvidia/nemotron-3.5-lightning",
        "z-ai/glm-5.3",
        "z-ai/glm-5.3-flash",
        "minimax/minimax-m3",
    ])("strips unsupported cache_control for %s", async (modelName) => {
        const transform = findModelByName(modelName)?.transform;
        if (!transform) throw new Error(`${modelName} transform missing`);

        const result = await transform(
            [
                {
                    role: "system",
                    cache_control: { type: "ephemeral" },
                    content: [
                        {
                            type: "text",
                            text: "Be terse.",
                            cache_control: { type: "ephemeral" },
                        },
                    ],
                },
                {
                    role: "tool",
                    tool_call_id: "call_1",
                    content: "Done",
                    cache_control: { type: "ephemeral" },
                },
            ],
            {},
        );

        expect(result.messages).toEqual([
            { role: "system", content: [{ type: "text", text: "Be terse." }] },
            { role: "tool", tool_call_id: "call_1", content: "Done" },
        ]);
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
