import { describe, expect, it } from "vitest";
import {
    chatToMessagesResponse,
    createMessagesStreamTranslator,
    MessagesRequestError,
    MessagesRequestSchema,
    messagesError,
    messagesToChatRequest,
} from "@/text/messages/translate.ts";

const usage = {
    prompt_tokens: 100,
    completion_tokens: 20,
    total_tokens: 120,
    prompt_tokens_details: { cached_tokens: 60, cache_write_tokens: 10 },
};

const translate = (body: unknown) =>
    messagesToChatRequest(MessagesRequestSchema.parse(body));

describe("messagesToChatRequest", () => {
    it("translates system, images, tools and tool results", () => {
        const chat = translate({
            model: "openai",
            max_tokens: 512,
            system: [
                {
                    type: "text",
                    text: "Be brief.",
                    cache_control: { type: "ephemeral" },
                },
            ],
            stop_sequences: ["END"],
            stream: true,
            tools: [
                {
                    name: "read",
                    description: "Read a file",
                    input_schema: { type: "object" },
                },
            ],
            tool_choice: { type: "any", disable_parallel_tool_use: true },
            thinking: { type: "enabled", budget_tokens: 8000 },
            metadata: { user_id: "ignored" },
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Look" },
                        {
                            type: "image",
                            source: {
                                type: "base64",
                                media_type: "image/png",
                                data: "AAAA",
                            },
                        },
                    ],
                },
                {
                    role: "assistant",
                    content: [
                        { type: "thinking", thinking: "hmm", signature: "" },
                        { type: "text", text: "Reading." },
                        {
                            type: "tool_use",
                            id: "call_1",
                            name: "read",
                            input: { path: "a.txt" },
                        },
                    ],
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "tool_result",
                            tool_use_id: "call_1",
                            content: "hello",
                        },
                        { type: "text", text: "Continue" },
                    ],
                },
            ],
        });

        expect(chat).toEqual({
            model: "openai",
            max_tokens: 512,
            stop: ["END"],
            stream: true,
            stream_options: { include_usage: true },
            reasoning_effort: "medium",
            tool_choice: "required",
            parallel_tool_calls: false,
            tools: [
                {
                    type: "function",
                    function: {
                        name: "read",
                        description: "Read a file",
                        parameters: { type: "object" },
                    },
                },
            ],
            messages: [
                {
                    role: "system",
                    content: [
                        {
                            type: "text",
                            text: "Be brief.",
                            cache_control: { type: "ephemeral" },
                        },
                    ],
                },
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Look" },
                        {
                            type: "image_url",
                            image_url: { url: "data:image/png;base64,AAAA" },
                        },
                    ],
                },
                {
                    role: "assistant",
                    content: "Reading.",
                    tool_calls: [
                        {
                            id: "call_1",
                            type: "function",
                            function: {
                                name: "read",
                                arguments: '{"path":"a.txt"}',
                            },
                        },
                    ],
                },
                { role: "tool", tool_call_id: "call_1", content: "hello" },
                {
                    role: "user",
                    content: [{ type: "text", text: "Continue" }],
                },
            ],
        });
    });

    it("rejects unsupported content blocks", () => {
        expect(() =>
            translate({
                messages: [
                    {
                        role: "user",
                        content: [{ type: "server_tool_use", id: "x" }],
                    },
                ],
            }),
        ).toThrow(MessagesRequestError);
    });
});

describe("chatToMessagesResponse", () => {
    it("returns thinking, text and tool_use blocks with Anthropic usage", () => {
        expect(
            chatToMessagesResponse({
                id: "chatcmpl-1",
                model: "openai",
                choices: [
                    {
                        finish_reason: "tool_calls",
                        message: {
                            reasoning_content: "plan",
                            content: "Sure.",
                            tool_calls: [
                                {
                                    id: "call_1",
                                    function: {
                                        name: "read",
                                        arguments: '{"path":"a"}',
                                    },
                                },
                            ],
                        },
                    },
                ],
                usage,
            }),
        ).toEqual({
            id: "msg_chatcmpl-1",
            type: "message",
            role: "assistant",
            model: "openai",
            content: [
                { type: "thinking", thinking: "plan", signature: "" },
                { type: "text", text: "Sure." },
                {
                    type: "tool_use",
                    id: "call_1",
                    name: "read",
                    input: { path: "a" },
                },
            ],
            stop_reason: "tool_use",
            stop_sequence: null,
            usage: {
                input_tokens: 30,
                output_tokens: 20,
                cache_read_input_tokens: 60,
                cache_creation_input_tokens: 10,
            },
        });
    });
});

const chunk = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;

function runStream(text: string) {
    const translator = createMessagesStreamTranslator("openai");
    const decoder = new TextDecoder();
    const bytes = [
        ...translator.feed(new TextEncoder().encode(text)),
        ...translator.end(),
    ];
    return bytes
        .map((b) => decoder.decode(b))
        .join("")
        .split("\n\n")
        .filter(Boolean)
        .map((event) => {
            const [name, data] = event.split("\n");
            return {
                event: name.slice("event: ".length),
                data: JSON.parse(data.slice("data: ".length)),
            };
        });
}

describe("createMessagesStreamTranslator", () => {
    it("streams thinking, text and tool_use in Messages order", () => {
        const events = runStream(
            [
                chunk({
                    id: "c1",
                    choices: [{ delta: { reasoning_content: "think" } }],
                }),
                chunk({ id: "c1", choices: [{ delta: { content: "Hi" } }] }),
                chunk({
                    id: "c1",
                    choices: [
                        {
                            delta: {
                                tool_calls: [
                                    {
                                        index: 0,
                                        id: "call_1",
                                        function: {
                                            name: "read",
                                            arguments: '{"p":',
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                }),
                chunk({
                    id: "c1",
                    choices: [
                        {
                            delta: {
                                tool_calls: [
                                    { index: 0, function: { arguments: "1}" } },
                                ],
                            },
                            finish_reason: "tool_calls",
                        },
                    ],
                }),
                chunk({ id: "c1", choices: [], usage }),
                "data: [DONE]\n\n",
            ].join(""),
        );

        expect(events.map((e) => e.event)).toEqual([
            "message_start",
            "content_block_start",
            "content_block_delta",
            "content_block_stop",
            "content_block_start",
            "content_block_delta",
            "content_block_stop",
            "content_block_start",
            "content_block_delta",
            "content_block_delta",
            "content_block_stop",
            "message_delta",
            "message_stop",
        ]);
        expect(events[1].data.content_block.type).toBe("thinking");
        expect(events[2].data.delta).toEqual({
            type: "thinking_delta",
            thinking: "think",
        });
        expect(events[5].data.delta).toEqual({
            type: "text_delta",
            text: "Hi",
        });
        expect(events[7].data).toMatchObject({
            index: 2,
            content_block: { type: "tool_use", id: "call_1", name: "read" },
        });
        expect(events[9].data.delta).toEqual({
            type: "input_json_delta",
            partial_json: "1}",
        });
        expect(events[11].data).toEqual({
            type: "message_delta",
            delta: { stop_reason: "tool_use", stop_sequence: null },
            usage: {
                input_tokens: 30,
                output_tokens: 20,
                cache_read_input_tokens: 60,
                cache_creation_input_tokens: 10,
            },
        });
    });

    it("ends with an error event when usage is missing", () => {
        const events = runStream(
            `${chunk({ id: "c1", choices: [{ delta: { content: "Hi" } }] })}data: [DONE]\n\n`,
        );
        expect(events.at(-1)).toEqual({
            event: "error",
            data: {
                type: "error",
                error: { type: "api_error", message: "Provider omitted usage" },
            },
        });
        expect(events.some((e) => e.event === "message_stop")).toBe(false);
    });

    it("forwards the Chat usage_missing error as an error event", () => {
        const events = runStream(
            chunk({
                error: {
                    message:
                        "Chat Completions provider ended without terminal usage",
                    code: "usage_missing",
                },
            }),
        );
        expect(events.at(-1)?.event).toBe("error");
    });

    it("ends with an error event when the stream is cut", () => {
        const events = runStream(
            chunk({ id: "c1", choices: [{ delta: { content: "Hi" } }] }),
        );
        expect(events.at(-1)?.event).toBe("error");
    });
});

describe("messagesError", () => {
    it.each([
        [401, "authentication_error"],
        [402, "billing_error"],
        [429, "rate_limit_error"],
        [500, "api_error"],
    ])("maps %i to %s", (status, type) => {
        expect(messagesError(status, "x").error.type).toBe(type);
    });
});
