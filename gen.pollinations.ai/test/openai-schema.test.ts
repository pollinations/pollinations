import {
    CreateChatCompletionRequestSchema,
    CreateChatCompletionResponseSchema,
    CreateChatCompletionStreamResponseSchema,
} from "@shared/schemas/openai.ts";
import { describe, expect, it } from "vitest";

describe("OpenAI request schema", () => {
    it("preserves provider extension fields", () => {
        const parsed = CreateChatCompletionRequestSchema.parse({
            model: "openai-fast",
            messages: [{ role: "user", content: "hi" }],
            metadata: { trace_id: "abc" },
            provider_metadata: { route: "test" },
        });

        expect(parsed.metadata).toEqual({ trace_id: "abc" });
        expect(parsed.provider_metadata).toEqual({ route: "test" });
    });

    it("preserves OpenRouter reasoning request config", () => {
        const parsed = CreateChatCompletionRequestSchema.parse({
            model: "mistral-4",
            messages: [{ role: "user", content: "hi" }],
            reasoning: { effort: "high", exclude: false },
        });

        expect(parsed.reasoning).toEqual({ effort: "high", exclude: false });
    });
});

describe("OpenAI response schema", () => {
    it("preserves OpenRouter reasoning fields on non-streaming responses", () => {
        const parsed = CreateChatCompletionResponseSchema.parse({
            id: "chatcmpl_test",
            object: "chat.completion",
            created: 1,
            model: "mistralai/mistral-small-2603",
            choices: [
                {
                    index: 0,
                    finish_reason: "stop",
                    message: {
                        role: "assistant",
                        content: "Final answer",
                        reasoning: "Reasoning trace",
                        reasoning_details: [
                            {
                                type: "reasoning.text",
                                text: "Reasoning trace",
                                format: "unknown",
                                index: 0,
                            },
                        ],
                    },
                },
            ],
        });

        expect(parsed.choices[0]?.message?.reasoning).toBe("Reasoning trace");
        expect(parsed.choices[0]?.message?.reasoning_details?.[0]?.text).toBe(
            "Reasoning trace",
        );
    });

    it("preserves OpenRouter reasoning fields on streaming deltas", () => {
        const parsed = CreateChatCompletionStreamResponseSchema.parse({
            id: "chatcmpl_test",
            object: "chat.completion.chunk",
            created: 1,
            model: "mistralai/mistral-small-2603",
            choices: [
                {
                    index: 0,
                    finish_reason: null,
                    delta: {
                        role: "assistant",
                        content: "",
                        reasoning: "Reasoning delta",
                        reasoning_details: [
                            {
                                type: "reasoning.text",
                                text: "Reasoning delta",
                                format: "unknown",
                                index: 0,
                            },
                        ],
                    },
                },
            ],
        });

        expect(parsed.choices[0]?.delta?.reasoning).toBe("Reasoning delta");
        expect(parsed.choices[0]?.delta?.reasoning_details?.[0]?.text).toBe(
            "Reasoning delta",
        );
    });
});
