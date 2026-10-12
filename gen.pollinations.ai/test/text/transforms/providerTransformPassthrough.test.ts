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
    it("keeps Grok's ZDR fallback provider selection server-owned", async () => {
        const transform = findModelByName(
            "x-ai/grok-4.7:openrouter:xai-zdr",
        )?.transform;
        if (!transform) throw new Error("Grok fallback transform missing");
        const result = await transform(messages, {
            provider: { only: ["other"], zdr: false },
            temperature: 0.2,
        });
        expect(result.options).toEqual({ temperature: 0.2 });
        expect(result.messages).toEqual(messages);
    });

    it("preserves Grok reasoning effort and visibility through the Azure migration", async () => {
        const transform = findModelByName("x-ai/grok-4.7")?.transform;
        if (!transform) throw new Error("Grok transform missing");
        const options = { reasoning: { effort: "low", exclude: true } };
        expect(await transform(messages, options)).toEqual({
            messages,
            options: { ...options, reasoning_effort: "low" },
        });
        expect(
            (
                await transform(messages, {
                    ...options,
                    reasoning_effort: "high",
                })
            ).options.reasoning_effort,
        ).toBe("high");
    });

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
        "nvidia/nemotron-3-ultra",
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
