import { describe, expect, it } from "vitest";
import { messagesToChatRequest } from "../../src/text/messages/request.js";

describe("Anthropic Messages -> Chat Completions request", () => {
    it("prepends a system message and keeps cache_control on the final block", () => {
        const request = messagesToChatRequest(
            {
                model: "anthropic/claude-sonnet-4.6",
                max_tokens: 512,
                stream: false,
                messages: [{ role: "user", content: "Hi" }],
                system: [
                    {
                        type: "text",
                        text: "Static instructions",
                        cache_control: { type: "ephemeral" },
                    },
                ],
            } as never,
            "anthropic/claude-sonnet-4.6",
        );

        expect(request.messages[0]).toEqual({
            role: "system",
            content: [
                {
                    type: "text",
                    text: "Static instructions",
                    cache_control: { type: "ephemeral" },
                },
            ],
        });
        expect(request.messages[1]).toEqual({ role: "user", content: "Hi" });
        expect(request.max_tokens).toBe(512);
    });

    it("translates base64 and url images", () => {
        const request = messagesToChatRequest(
            {
                model: "m",
                max_tokens: 100,
                stream: false,
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "image",
                                source: {
                                    type: "base64",
                                    media_type: "image/png",
                                    data: "AAAA",
                                },
                            },
                            {
                                type: "image",
                                source: {
                                    type: "url",
                                    url: "https://example.com/cat.png",
                                },
                            },
                            { type: "text", text: "What are these?" },
                        ],
                    },
                ],
            } as never,
            "m",
        );

        expect(request.messages[0]).toEqual({
            role: "user",
            content: [
                {
                    type: "image_url",
                    image_url: { url: "data:image/png;base64,AAAA" },
                },
                {
                    type: "image_url",
                    image_url: { url: "https://example.com/cat.png" },
                },
                { type: "text", text: "What are these?" },
            ],
        });
    });

    it("splits tool_result blocks into their own tool messages", () => {
        const request = messagesToChatRequest(
            {
                model: "m",
                max_tokens: 100,
                stream: false,
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "tool_result",
                                tool_use_id: "toolu_1",
                                content: "72F and sunny",
                            },
                            {
                                type: "tool_result",
                                tool_use_id: "toolu_2",
                                content: "not found",
                                is_error: true,
                            },
                        ],
                    },
                ],
            } as never,
            "m",
        );

        expect(request.messages).toEqual([
            {
                role: "tool",
                tool_call_id: "toolu_1",
                content: "72F and sunny",
            },
            {
                role: "tool",
                tool_call_id: "toolu_2",
                content: "Error: not found",
            },
        ]);
    });

    it("maps assistant text and tool_use into content plus tool_calls", () => {
        const request = messagesToChatRequest(
            {
                model: "m",
                max_tokens: 100,
                stream: false,
                messages: [
                    { role: "user", content: "What's the weather in Rome?" },
                    {
                        role: "assistant",
                        content: [
                            { type: "text", text: "Let me check." },
                            {
                                type: "tool_use",
                                id: "toolu_1",
                                name: "get_weather",
                                input: { city: "Rome" },
                            },
                        ],
                    },
                ],
            } as never,
            "m",
        );

        expect(request.messages[1]).toEqual({
            role: "assistant",
            content: [{ type: "text", text: "Let me check." }],
            tool_calls: [
                {
                    id: "toolu_1",
                    type: "function",
                    function: {
                        name: "get_weather",
                        arguments: JSON.stringify({ city: "Rome" }),
                    },
                },
            ],
        });
    });

    it("drops thinking blocks from replayed assistant history", () => {
        const request = messagesToChatRequest(
            {
                model: "m",
                max_tokens: 100,
                stream: false,
                messages: [
                    { role: "user", content: "hi" },
                    {
                        role: "assistant",
                        content: [
                            {
                                type: "thinking",
                                thinking: "reasoning...",
                                signature: "sig",
                            },
                            { type: "text", text: "Hello!" },
                        ],
                    },
                ],
            } as never,
            "m",
        );

        expect(request.messages[1]).toEqual({
            role: "assistant",
            content: [{ type: "text", text: "Hello!" }],
        });
    });

    it("maps tools, tool_choice, stop_sequences, and thinking budget", () => {
        const request = messagesToChatRequest(
            {
                model: "m",
                max_tokens: 100,
                stream: true,
                stop_sequences: ["END"],
                thinking: { type: "enabled", budget_tokens: 4096 },
                tools: [
                    {
                        name: "get_weather",
                        description: "Get the weather",
                        input_schema: {
                            type: "object",
                            properties: { city: { type: "string" } },
                        },
                    },
                ],
                tool_choice: { type: "tool", name: "get_weather" },
                messages: [{ role: "user", content: "hi" }],
            } as never,
            "m",
        );

        expect(request.stop).toEqual(["END"]);
        expect(request.reasoning_effort).toBe("high");
        expect(request.tools).toEqual([
            {
                type: "function",
                function: {
                    name: "get_weather",
                    description: "Get the weather",
                    parameters: {
                        type: "object",
                        properties: { city: { type: "string" } },
                    },
                },
            },
        ]);
        expect(request.tool_choice).toEqual({
            type: "function",
            function: { name: "get_weather" },
        });
    });

    it("maps disabled thinking to reasoning_effort none", () => {
        const request = messagesToChatRequest(
            {
                model: "m",
                max_tokens: 100,
                stream: false,
                thinking: { type: "disabled" },
                messages: [{ role: "user", content: "hi" }],
            } as never,
            "m",
        );

        expect(request.reasoning_effort).toBe("none");
    });
});
