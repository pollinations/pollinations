import { CreateMessagesRequestSchema } from "@shared/schemas/anthropic.ts";
import { describe, expect, it } from "vitest";
import { translateMessagesRequest } from "@/text/messages/request.ts";

function translate(body: Record<string, unknown>) {
    return translateMessagesRequest(
        CreateMessagesRequestSchema.parse(body),
    );
}

const base = {
    model: "openai",
    max_tokens: 64,
    messages: [{ role: "user", content: "hello" }],
};

describe("translateMessagesRequest", () => {
    it("maps a system string to a leading system message", () => {
        const chat = translate({ ...base, system: "be brief" });
        expect(chat.messages[0]).toEqual({
            role: "system",
            content: "be brief",
        });
        expect(chat.messages[1]).toEqual({
            role: "user",
            content: "hello",
        });
    });

    it("passes system block cache_control through", () => {
        const chat = translate({
            ...base,
            system: [
                { type: "text", text: "prefix", cache_control: { type: "ephemeral" } },
                { type: "text", text: "suffix" },
            ],
        });
        expect(chat.messages[0]).toEqual({
            role: "system",
            content: [
                {
                    type: "text",
                    text: "prefix",
                    cache_control: { type: "ephemeral" },
                },
                { type: "text", text: "suffix" },
            ],
        });
    });

    it("maps base64 and url images to image_url parts", () => {
        const chat = translate({
            ...base,
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "look" },
                        {
                            type: "image",
                            source: {
                                type: "base64",
                                media_type: "image/png",
                                data: "aGVsbG8=",
                            },
                        },
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
        expect(chat.messages[0]).toEqual({
            role: "user",
            content: [
                { type: "text", text: "look" },
                {
                    type: "image_url",
                    image_url: { url: "data:image/png;base64,aGVsbG8=" },
                },
                {
                    type: "image_url",
                    image_url: { url: "https://example.com/cat.png" },
                },
            ],
        });
    });

    it("maps tool_use and tool_result to tool_calls and tool messages", () => {
        const chat = translate({
            ...base,
            messages: [
                {
                    role: "assistant",
                    content: [
                        { type: "text", text: "checking" },
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
                            content: "sunny",
                        },
                    ],
                },
            ],
        });
        expect(chat.messages[0]).toEqual({
            role: "assistant",
            content: [{ type: "text", text: "checking" }],
            tool_calls: [
                {
                    id: "toolu_1",
                    type: "function",
                    function: {
                        name: "get_weather",
                        arguments: JSON.stringify({ city: "Paris" }),
                    },
                },
            ],
        });
        expect(chat.messages[1]).toEqual({
            role: "tool",
            content: "sunny",
            tool_call_id: "toolu_1",
        });
    });

    it("stringifies nested tool_result blocks", () => {
        const chat = translate({
            ...base,
            messages: [
                { role: "user", content: "hello" },
                {
                    role: "user",
                    content: [
                        {
                            type: "tool_result",
                            tool_use_id: "toolu_2",
                            content: [
                                { type: "text", text: "a" },
                                { type: "text", text: "b" },
                            ],
                        },
                    ],
                },
            ],
        });
        expect(chat.messages[0]).toEqual({
            role: "user",
            content: "hello",
        });
        expect(chat.messages[1]).toEqual({
            role: "tool",
            content: "ab",
            tool_call_id: "toolu_2",
        });
    });

    it("maps tools and tool_choice variants", () => {
        const tools = [
            {
                name: "get_weather",
                description: "City weather",
                input_schema: {
                    type: "object",
                    properties: { city: { type: "string" } },
                },
            },
        ];
        expect(
            translate({ ...base, tools, tool_choice: { type: "any" } }),
        ).toMatchObject({
            tools: [
                {
                    type: "function",
                    function: {
                        name: "get_weather",
                        description: "City weather",
                        parameters: {
                            type: "object",
                            properties: { city: { type: "string" } },
                        },
                    },
                },
            ],
            tool_choice: "required",
        });
        expect(
            translate({ ...base, tool_choice: { type: "tool", name: "get_weather" } }),
        ).toMatchObject({
            tool_choice: {
                type: "function",
                function: { name: "get_weather" },
            },
        });
        expect(translate({ ...base, tool_choice: { type: "none" } })).toMatchObject({
            tool_choice: "none",
        });
    });

    it("maps stop_sequences, thinking, metadata, and stream options", () => {
        const chat = translate({
            ...base,
            stream: true,
            stop_sequences: ["END"],
            thinking: { type: "enabled", budget_tokens: 2048 },
            metadata: { user_id: "user_1" },
            temperature: 0.5,
            top_p: 0.9,
        });
        expect(chat).toMatchObject({
            stop: ["END"],
            reasoning_effort: "high",
            user: "user_1",
            temperature: 0.5,
            top_p: 0.9,
            stream: true,
            stream_options: { include_usage: true },
        });
    });

    it("accepts adaptive thinking and Claude Code extras without failing", () => {
        const parsed = CreateMessagesRequestSchema.parse({
            ...base,
            thinking: { type: "adaptive", display: "omitted" },
            output_config: { effort: "high" },
            service_tier: "standard_only",
            context_management: [],
            metadata: { user_id: "u", extra: 1 },
        });
        const chat = translateMessagesRequest(parsed);
        expect(chat).toMatchObject({ reasoning_effort: "high" });
    });

    it("carries a system role inside messages through as system", () => {
        const chat = translate({
            ...base,
            messages: [
                { role: "system", content: "from history" },
                { role: "user", content: "hi" },
            ],
        });
        expect(chat.messages[0]).toEqual({
            role: "system",
            content: "from history",
        });
    });

    it("drops prior-turn thinking instead of replaying it", () => {
        const chat = translate({
            ...base,
            messages: [
                {
                    role: "assistant",
                    content: [
                        { type: "thinking", thinking: "hmm", signature: "sig" },
                        { type: "text", text: "done" },
                    ],
                },
            ],
        });
        expect(chat.messages).toEqual([
            { role: "assistant", content: "done" },
        ]);
    });
});
