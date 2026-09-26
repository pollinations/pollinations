import { describe, expect, it } from "vitest";
import { chatCompletionToMessage } from "../../src/text/messages/response.js";
import type { ChatCompletion } from "../../src/text/types.js";

function completion(overrides: Partial<ChatCompletion>): ChatCompletion {
    return {
        id: "chatcmpl-1",
        choices: [
            {
                index: 0,
                finish_reason: "stop",
                message: { role: "assistant", content: "Hello!" },
            },
        ],
        usage: { prompt_tokens: 12, completion_tokens: 34 },
        ...overrides,
    } as ChatCompletion;
}

describe("chatCompletionToMessage", () => {
    it("builds a Messages response with Anthropic usage fields", () => {
        const message = chatCompletionToMessage(
            completion({
                usage: {
                    prompt_tokens: 12,
                    completion_tokens: 34,
                    cache_read_input_tokens: 8,
                    cache_creation_input_tokens: 2,
                },
            }),
            "openai",
        );
        expect(message).toMatchObject({
            id: "msg_chatcmpl-1",
            type: "message",
            role: "assistant",
            model: "openai",
            stop_reason: "end_turn",
        });
        expect(message.content).toEqual([{ type: "text", text: "Hello!" }]);
        expect(message.usage).toEqual({
            input_tokens: 12,
            output_tokens: 34,
            cache_read_input_tokens: 8,
            cache_creation_input_tokens: 2,
        });
    });

    it("maps tool_calls into tool_use blocks and stop_reason tool_use", () => {
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
                                    id: "call_1",
                                    type: "function",
                                    function: {
                                        name: "get_weather",
                                        arguments: '{"city":"Paris"}',
                                    },
                                },
                            ],
                        },
                    },
                ],
            }),
            "openai",
        );
        expect(message.stop_reason).toBe("tool_use");
        expect(message.content).toEqual([
            {
                type: "tool_use",
                id: "call_1",
                name: "get_weather",
                input: { city: "Paris" },
            },
        ]);
    });

    it("emits thinking blocks from reasoning_content", () => {
        const message = chatCompletionToMessage(
            completion({
                choices: [
                    {
                        index: 0,
                        finish_reason: "stop",
                        message: {
                            role: "assistant",
                            content: "Answer",
                            reasoning_content: "Because 2+2",
                        },
                    },
                ],
            }),
            "openai",
        );
        expect(message.content).toEqual([
            { type: "thinking", thinking: "Because 2+2" },
            { type: "text", text: "Answer" },
        ]);
    });

    it("fails with an error instead of returning an unbilled message", () => {
        expect(() =>
            chatCompletionToMessage(completion({ usage: undefined }), "openai"),
        ).toThrow(/usage/i);
    });
});
