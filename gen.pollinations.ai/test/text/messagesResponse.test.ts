import { describe, expect, it } from "vitest";
import { chatCompletionToMessage } from "../../src/text/messages/response.js";
import type { ChatCompletion } from "../../src/text/types.js";

function completion(overrides: Partial<ChatCompletion>): ChatCompletion {
    return {
        id: "pllns_abc123",
        object: "chat.completion",
        created: 0,
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        ...overrides,
    };
}

describe("Chat Completions -> Anthropic Message response", () => {
    it("maps plain text and usage", () => {
        const message = chatCompletionToMessage(
            completion({
                choices: [
                    {
                        index: 0,
                        finish_reason: "stop",
                        message: { role: "assistant", content: "Hello!" },
                    },
                ],
            }),
            "anthropic/claude-sonnet-4.6",
        );

        expect(message.id).toBe("msg_abc123");
        expect(message.model).toBe("anthropic/claude-sonnet-4.6");
        expect(message.content).toEqual([{ type: "text", text: "Hello!" }]);
        expect(message.stop_reason).toBe("end_turn");
        expect(message.usage).toEqual({ input_tokens: 10, output_tokens: 5 });
    });

    it("maps tool_calls to tool_use blocks and finish_reason tool_calls to stop_reason tool_use", () => {
        const message = chatCompletionToMessage(
            completion({
                choices: [
                    {
                        index: 0,
                        finish_reason: "tool_calls",
                        message: {
                            role: "assistant",
                            content: null,
                            tool_calls: [
                                {
                                    id: "toolu_1",
                                    type: "function",
                                    function: {
                                        name: "get_weather",
                                        arguments: JSON.stringify({
                                            city: "Rome",
                                        }),
                                    },
                                },
                            ],
                        },
                    },
                ],
            }),
            "m",
        );

        expect(message.content).toEqual([
            {
                type: "tool_use",
                id: "toolu_1",
                name: "get_weather",
                input: { city: "Rome" },
            },
        ]);
        expect(message.stop_reason).toBe("tool_use");
    });

    it("emits a leading thinking block from content_blocks", () => {
        const message = chatCompletionToMessage(
            completion({
                choices: [
                    {
                        index: 0,
                        finish_reason: "stop",
                        message: {
                            role: "assistant",
                            content: "The answer is 42.",
                            content_blocks: [
                                {
                                    type: "thinking",
                                    thinking: "Let me work this out...",
                                },
                            ],
                        },
                    },
                ],
            }),
            "m",
        );

        expect(message.content).toEqual([
            {
                type: "thinking",
                thinking: "Let me work this out...",
                signature: "",
            },
            { type: "text", text: "The answer is 42." },
        ]);
    });

    it("falls back to reasoning_content when content_blocks is absent", () => {
        const message = chatCompletionToMessage(
            completion({
                choices: [
                    {
                        index: 0,
                        finish_reason: "stop",
                        message: {
                            role: "assistant",
                            content: "42",
                            reasoning_content: "thinking out loud",
                        },
                    },
                ],
            }),
            "m",
        );

        expect(message.content[0]).toEqual({
            type: "thinking",
            thinking: "thinking out loud",
            signature: "",
        });
    });

    it("maps cache usage fields", () => {
        const message = chatCompletionToMessage(
            completion({
                choices: [
                    {
                        index: 0,
                        finish_reason: "stop",
                        message: { role: "assistant", content: "hi" },
                    },
                ],
                usage: {
                    prompt_tokens: 100,
                    completion_tokens: 20,
                    total_tokens: 120,
                    prompt_tokens_details: {
                        cached_tokens: 40,
                        cache_write_tokens: 10,
                    },
                },
            }),
            "m",
        );

        expect(message.usage).toEqual({
            input_tokens: 100,
            output_tokens: 20,
            cache_creation_input_tokens: 10,
            cache_read_input_tokens: 40,
        });
    });

    it("maps length finish_reason to max_tokens stop_reason", () => {
        const message = chatCompletionToMessage(
            completion({
                choices: [
                    {
                        index: 0,
                        finish_reason: "length",
                        message: { role: "assistant", content: "..." },
                    },
                ],
            }),
            "m",
        );

        expect(message.stop_reason).toBe("max_tokens");
    });
});
