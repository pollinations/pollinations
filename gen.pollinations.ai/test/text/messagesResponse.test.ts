import { describe, expect, it } from "vitest";
import {
    chatUsageToMessagesUsage,
    MessagesUsageError,
    translateChatCompletion,
    translateChatMessage,
} from "@/text/messages/response.ts";

const usage = {
    prompt_tokens: 100,
    completion_tokens: 25,
    total_tokens: 125,
    prompt_tokens_details: { cached_tokens: 40, cache_write_tokens: 10 },
    completion_tokens_details: { reasoning_tokens: 5 },
};

describe("chatUsageToMessagesUsage", () => {
    it("maps tokens to Anthropic fields with cache breakdown", () => {
        expect(chatUsageToMessagesUsage(usage)).toEqual({
            input_tokens: 100,
            output_tokens: 25,
            cache_creation_input_tokens: 10,
            cache_read_input_tokens: 40,
        });
    });

    it("omits cache fields when there are no cache tokens", () => {
        expect(
            chatUsageToMessagesUsage({
                prompt_tokens: 10,
                completion_tokens: 5,
                total_tokens: 15,
            }),
        ).toEqual({ input_tokens: 10, output_tokens: 5 });
    });

    it("fails loudly when usage is missing", () => {
        expect(() => chatUsageToMessagesUsage(undefined)).toThrow(
            MessagesUsageError,
        );
        expect(() => chatUsageToMessagesUsage(null)).toThrow(
            MessagesUsageError,
        );
        expect(() =>
            chatUsageToMessagesUsage({ prompt_tokens: 1 }),
        ).toThrow(MessagesUsageError);
    });
});

describe("translateChatMessage", () => {
    it("orders reasoning before text before tool calls", () => {
        const { content, hasToolCalls } = translateChatMessage({
            content: "sunny",
            reasoning_content: "checking sources",
            tool_calls: [
                {
                    id: "call_1",
                    function: {
                        name: "get_weather",
                        arguments: JSON.stringify({ city: "Paris" }),
                    },
                },
            ],
        });
        expect(content).toEqual([
            { type: "thinking", thinking: "checking sources" },
            { type: "text", text: "sunny" },
            {
                type: "tool_use",
                id: "call_1",
                name: "get_weather",
                input: { city: "Paris" },
            },
        ]);
        expect(hasToolCalls).toBe(true);
    });

    it("falls back to an empty input object on malformed arguments", () => {
        const { content } = translateChatMessage({
            tool_calls: [
                { id: "call_2", function: { name: "x", arguments: "{nope" } },
            ],
        });
        expect(content).toEqual([
            { type: "tool_use", id: "call_2", name: "x", input: {} },
        ]);
    });
});

describe("translateChatCompletion", () => {
    it("builds a message with end_turn and usage", () => {
        const message = translateChatCompletion(
            {
                id: "chatcmpl-1",
                model: "openai",
                choices: [
                    { message: { content: "hi" }, finish_reason: "stop" },
                ],
                usage,
            },
            "openai",
        );
        expect(message).toMatchObject({
            id: "chatcmpl-1",
            type: "message",
            role: "assistant",
            model: "openai",
            stop_reason: "end_turn",
            stop_sequence: null,
            content: [{ type: "text", text: "hi" }],
            usage: {
                input_tokens: 100,
                output_tokens: 25,
                cache_creation_input_tokens: 10,
                cache_read_input_tokens: 40,
            },
        });
    });

    it("maps stop reasons", () => {
        const finish = (finish_reason: string | null) =>
            translateChatCompletion(
                {
                    id: "x",
                    choices: [{ message: { content: "t" }, finish_reason }],
                    usage,
                },
                "m",
            ).stop_reason;
        expect(finish("length")).toBe("max_tokens");
        expect(finish("tool_calls")).toBe("tool_use");
        expect(finish("content_filter")).toBe("refusal");
        expect(finish(null)).toBe("end_turn");
    });

    it("prefers tool_use when tool calls are present", () => {
        const message = translateChatCompletion(
            {
                id: "x",
                choices: [
                    {
                        message: {
                            tool_calls: [
                                {
                                    id: "c1",
                                    function: { name: "f", arguments: "{}" },
                                },
                            ],
                        },
                        finish_reason: "stop",
                    },
                ],
                usage,
            },
            "m",
        );
        expect(message.stop_reason).toBe("tool_use");
    });

    it("fails loudly without provider usage", () => {
        expect(() =>
            translateChatCompletion(
                {
                    id: "x",
                    choices: [{ message: { content: "t" }, finish_reason: "stop" }],
                },
                "m",
            ),
        ).toThrow(MessagesUsageError);
    });

    it("fails loudly without choices", () => {
        expect(() => translateChatCompletion({ id: "x", usage }, "m")).toThrow(
            MessagesUsageError,
        );
    });
});
