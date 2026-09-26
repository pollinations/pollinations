import { CreateMessageRequestSchema } from "@shared/schemas/anthropic.ts";
import { describe, expect, it } from "vitest";
import { messagesToChatRequest } from "../../src/text/messages/request.js";

function parse(body: Record<string, unknown>) {
    return messagesToChatRequest(
        CreateMessageRequestSchema.parse(body) as never,
    );
}

describe("messagesToChatRequest", () => {
    it("maps system, plain text and required max_tokens", () => {
        const chat = parse({
            model: "openai",
            max_tokens: 256,
            system: "Be terse.",
            messages: [{ role: "user", content: "Hi" }],
        });
        expect(chat.messages[0]).toEqual({
            role: "system",
            content: "Be terse.",
        });
        expect(chat.messages[1]).toEqual({ role: "user", content: "Hi" });
        expect(chat.max_tokens).toBe(256);
        expect(chat.stream).toBe(false);
    });

    it("translates text and image content blocks", () => {
        const chat = parse({
            model: "openai",
            max_tokens: 128,
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "What is this?" },
                        {
                            type: "image",
                            source: {
                                type: "url",
                                url: "https://example.com/cat.png",
                            },
                        },
                    ],
                },
            ],
        });
        const parts = chat.messages[0].content as Record<string, unknown>[];
        expect(parts[0]).toEqual({ type: "text", text: "What is this?" });
        expect(parts[1]).toEqual({
            type: "image_url",
            image_url: { url: "https://example.com/cat.png" },
        });
    });

    it("translates tool_use and tool_result blocks into OpenAI tool messages", () => {
        const chat = parse({
            model: "openai",
            max_tokens: 128,
            messages: [
                { role: "user", content: "Weather in Paris?" },
                {
                    role: "assistant",
                    content: [
                        {
                            type: "tool_use",
                            id: "toolu_1",
                            name: "get_weather",
                            input: { city: "Paris" },
                        },
                    ],
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "tool_result",
                            tool_use_id: "toolu_1",
                            content: "22C sunny",
                        },
                    ],
                },
            ],
        });
        expect(chat.messages[1].tool_calls?.[0]).toMatchObject({
            id: "toolu_1",
            type: "function",
            function: { name: "get_weather" },
        });
        expect(
            JSON.parse(
                chat.messages[1].tool_calls?.[0].function.arguments ?? "{}",
            ),
        ).toEqual({ city: "Paris" });
        expect(chat.messages[2]).toEqual({
            role: "tool",
            content: "22C sunny",
            tool_call_id: "toolu_1",
        });
    });

    it("maps tools, tool_choice, stop_sequences and thinking", () => {
        const chat = parse({
            model: "openai",
            max_tokens: 128,
            messages: [{ role: "user", content: "Hi" }],
            tools: [
                {
                    name: "get_weather",
                    description: "Look up weather",
                    input_schema: { type: "object" },
                },
            ],
            tool_choice: { type: "any" },
            thinking: { type: "enabled", budget_tokens: 1024 },
            stop_sequences: ["STOP"],
        });
        expect(chat.tools?.[0]).toEqual({
            type: "function",
            function: {
                name: "get_weather",
                description: "Look up weather",
                parameters: { type: "object" },
            },
        });
        expect(chat.tool_choice).toBe("required");
        expect(chat.stop).toEqual(["STOP"]);
        expect(chat.reasoning_effort).toBe("high");
    });
});
