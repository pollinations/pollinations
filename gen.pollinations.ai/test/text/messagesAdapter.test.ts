import { AnthropicMessageRequestSchema } from "@shared/schemas/anthropic.ts";
import { describe, expect, it, vi } from "vitest";
import { anthropicToChatRequest } from "../../src/text/messages/request.ts";
import { chatCompletionToAnthropic } from "../../src/text/messages/response.ts";
import {
    ANTHROPIC_STREAM_HEARTBEAT_MS,
    chatStreamToAnthropic,
} from "../../src/text/messages/stream.ts";
import type { ChatCompletion } from "../../src/text/types.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function sourceStream(text: string): ReadableStream<Uint8Array<ArrayBuffer>> {
    return new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode(text));
            controller.close();
        },
    });
}

async function streamText(
    stream: ReadableStream<Uint8Array<ArrayBuffer>>,
): Promise<string> {
    return new Response(stream).text();
}

describe("Anthropic Messages request adapter", () => {
    it("maps system, images, tools, tool results, caching, and thinking to Chat", () => {
        const request = AnthropicMessageRequestSchema.parse({
            model: "openai/gpt-5.4-nano",
            max_tokens: 512,
            system: [
                {
                    type: "text",
                    text: "Stable system",
                    cache_control: { type: "ephemeral" },
                },
            ],
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Look at this" },
                        {
                            type: "image",
                            source: {
                                type: "base64",
                                media_type: "image/png",
                                data: "aGVsbG8=",
                            },
                        },
                    ],
                },
                {
                    role: "assistant",
                    content: [
                        {
                            type: "thinking",
                            thinking: "Need a tool",
                            signature: "sig",
                        },
                        {
                            type: "tool_use",
                            id: "tool_1",
                            name: "read_file",
                            input: { path: "a.txt" },
                        },
                    ],
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "tool_result",
                            tool_use_id: "tool_1",
                            content: "file contents",
                            cache_control: { type: "ephemeral" },
                        },
                        { type: "text", text: "Continue" },
                    ],
                },
            ],
            tools: [
                {
                    name: "read_file",
                    description: "Read a file",
                    input_schema: {
                        type: "object",
                        properties: { path: { type: "string" } },
                    },
                    cache_control: { type: "ephemeral" },
                    defer_loading: true,
                },
            ],
            tool_choice: {
                type: "tool",
                name: "read_file",
                disable_parallel_tool_use: true,
            },
            stop_sequences: ["STOP"],
            thinking: { type: "adaptive" },
            output_config: {
                effort: "high",
                format: {
                    type: "json_schema",
                    schema: {
                        type: "object",
                        properties: { answer: { type: "string" } },
                    },
                },
            },
            metadata: { user_id: "sdk-user", ignored: null },
            anthropic_beta: ["context-1m"],
        });

        const chat = anthropicToChatRequest(request);
        expect(chat).toMatchObject({
            model: "openai/gpt-5.4-nano",
            max_tokens: 512,
            stop: ["STOP"],
            reasoning_effort: "high",
            parallel_tool_calls: false,
            metadata: { user_id: "sdk-user" },
            tool_choice: {
                type: "function",
                function: { name: "read_file" },
            },
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: "anthropic_output",
                    strict: true,
                },
            },
        });
        expect(chat.messages).toEqual([
            {
                role: "system",
                content: [
                    {
                        type: "text",
                        text: "Stable system",
                        cache_control: { type: "ephemeral" },
                    },
                ],
            },
            {
                role: "user",
                content: [
                    { type: "text", text: "Look at this" },
                    {
                        type: "image_url",
                        image_url: {
                            url: "data:image/png;base64,aGVsbG8=",
                        },
                    },
                ],
            },
            {
                role: "assistant",
                content: null,
                tool_calls: [
                    {
                        id: "tool_1",
                        type: "function",
                        function: {
                            name: "read_file",
                            arguments: '{"path":"a.txt"}',
                        },
                    },
                ],
                reasoning_content: "Need a tool",
            },
            {
                role: "tool",
                tool_call_id: "tool_1",
                content: "file contents",
                cache_control: { type: "ephemeral" },
            },
            {
                role: "user",
                content: [{ type: "text", text: "Continue" }],
            },
        ]);
        expect(chat.tools).toEqual([
            {
                type: "function",
                function: {
                    name: "read_file",
                    description: "Read a file",
                    parameters: {
                        type: "object",
                        properties: { path: { type: "string" } },
                    },
                },
            },
        ]);
    });

    it("accepts Claude Code mid-conversation system messages with cache markers", () => {
        const request = AnthropicMessageRequestSchema.parse({
            model: "openai/gpt-5.4-nano",
            max_tokens: 128,
            messages: [
                { role: "user", content: "first turn" },
                {
                    role: "system",
                    content: [
                        {
                            type: "text",
                            text: "Compaction context",
                            cache_control: { type: "ephemeral" },
                        },
                    ],
                },
                { role: "user", content: "continue" },
            ],
        });

        const chat = anthropicToChatRequest(request);
        expect(chat.messages).toEqual([
            { role: "user", content: "first turn" },
            {
                role: "system",
                content: [
                    {
                        type: "text",
                        text: "Compaction context",
                        cache_control: { type: "ephemeral" },
                    },
                ],
            },
            { role: "user", content: "continue" },
        ]);
    });

    it("preserves real Claude thinking signatures for multi-turn tool use", () => {
        const request = AnthropicMessageRequestSchema.parse({
            model: "anthropic/claude-sonnet-4.6",
            max_tokens: 256,
            messages: [
                { role: "user", content: "Use the tool" },
                {
                    role: "assistant",
                    content: [
                        {
                            type: "thinking",
                            thinking: "I should inspect the file.",
                            signature: "real-provider-signature",
                        },
                        {
                            type: "tool_use",
                            id: "tool_1",
                            name: "read_file",
                            input: { path: "a.txt" },
                        },
                    ],
                },
            ],
        });

        const chat = anthropicToChatRequest(request, {
            preserveThinkingBlocks: true,
        });
        expect(chat.messages[1]).toMatchObject({
            role: "assistant",
            content: [
                {
                    type: "thinking",
                    thinking: "I should inspect the file.",
                    signature: "real-provider-signature",
                },
            ],
            tool_calls: [
                {
                    id: "tool_1",
                    type: "function",
                    function: {
                        name: "read_file",
                        arguments: '{"path":"a.txt"}',
                    },
                },
            ],
        });
        expect(chat.messages[1]).not.toHaveProperty("reasoning_content");
    });

    it("accepts Claude Code compatibility fields without forwarding them raw", () => {
        const request = AnthropicMessageRequestSchema.parse({
            model: "openai/gpt-5.4-nano",
            max_tokens: 256,
            messages: [{ role: "user", content: "hello" }],
            thinking: { type: "enabled", budget_tokens: 4096 },
            output_config: { effort: "high" },
            metadata: { user_id: "claude-code" },
            service_tier: "auto",
            context_management: { edits: [] },
        });
        const chat = anthropicToChatRequest(request);
        expect(chat.reasoning_effort).toBe("high");
        expect(chat).not.toHaveProperty("thinking");
        expect(chat).not.toHaveProperty("output_config");
        expect(chat).not.toHaveProperty("service_tier");
        expect(chat).not.toHaveProperty("context_management");
    });
});

describe("Anthropic Messages response adapter", () => {
    it("maps thinking, text, tools, stop reason, and cache usage", () => {
        const completion = {
            id: "chatcmpl_test",
            object: "chat.completion",
            model: "provider-model",
            choices: [
                {
                    index: 0,
                    message: {
                        role: "assistant",
                        content: "Weather is sunny.",
                        reasoning_content: "Check the tool output.",
                        tool_calls: [
                            {
                                id: "call_1",
                                type: "function",
                                function: {
                                    name: "weather",
                                    arguments: '{"city":"Paris"}',
                                },
                            },
                        ],
                    },
                    finish_reason: "tool_calls",
                },
            ],
            usage: {
                prompt_tokens: 12,
                completion_tokens: 7,
                total_tokens: 19,
                prompt_tokens_details: {
                    cached_tokens: 2,
                    cache_write_tokens: 1,
                },
                completion_tokens_details: {
                    reasoning_tokens: 3,
                },
            },
        } as ChatCompletion;

        const message = chatCompletionToAnthropic(
            completion,
            "openai/gpt-5.4-nano",
        );
        expect(message).toMatchObject({
            id: "chatcmpl_test",
            type: "message",
            role: "assistant",
            model: "openai/gpt-5.4-nano",
            stop_reason: "tool_use",
            stop_sequence: null,
            usage: {
                input_tokens: 9,
                output_tokens: 7,
                cache_creation_input_tokens: 1,
                cache_read_input_tokens: 2,
                output_tokens_details: { thinking_tokens: 3 },
            },
        });
        expect(message.content).toEqual([
            {
                type: "thinking",
                thinking: "Check the tool output.",
                signature: "pollinations",
            },
            { type: "text", text: "Weather is sunny." },
            {
                type: "tool_use",
                id: "call_1",
                name: "weather",
                input: { city: "Paris" },
            },
        ]);
    });
});

describe("Anthropic Messages stream adapter", () => {
    it("emits ordered thinking, text, tool, and terminal usage events", async () => {
        const chunks = [
            {
                id: "chatcmpl_stream",
                choices: [
                    {
                        index: 0,
                        delta: { role: "assistant" },
                        finish_reason: null,
                    },
                ],
            },
            {
                choices: [
                    {
                        index: 0,
                        delta: { reasoning_content: "Think" },
                        finish_reason: null,
                    },
                ],
            },
            {
                choices: [
                    {
                        index: 0,
                        delta: { content: "Hello" },
                        finish_reason: null,
                    },
                ],
            },
            {
                choices: [
                    {
                        index: 0,
                        delta: {
                            tool_calls: [
                                {
                                    index: 0,
                                    id: "call_1",
                                    function: {
                                        name: "weather",
                                        arguments: '{"city":"Paris"}',
                                    },
                                },
                            ],
                        },
                        finish_reason: null,
                    },
                ],
            },
            {
                choices: [
                    {
                        index: 0,
                        delta: {},
                        finish_reason: "tool_calls",
                    },
                ],
                usage: {
                    prompt_tokens: 12,
                    completion_tokens: 7,
                    total_tokens: 19,
                    prompt_tokens_details: {
                        cached_tokens: 2,
                        cache_write_tokens: 1,
                    },
                    completion_tokens_details: {
                        reasoning_tokens: 3,
                    },
                },
            },
        ];
        const raw = `${chunks
            .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
            .join("")}data: [DONE]\n\n`;

        const text = await streamText(
            chatStreamToAnthropic(sourceStream(raw), "openai/gpt-5.4-nano"),
        );
        const events = text
            .split("\n\n")
            .filter(Boolean)
            .map((event) => {
                const lines = event.split("\n");
                return {
                    event: lines[0].slice("event: ".length),
                    data: JSON.parse(lines[1].slice("data: ".length)),
                };
            });

        expect(events.map((event) => event.event)).toEqual([
            "message_start",
            "content_block_start",
            "content_block_delta",
            "content_block_delta",
            "content_block_stop",
            "content_block_start",
            "content_block_delta",
            "content_block_stop",
            "content_block_start",
            "content_block_delta",
            "content_block_stop",
            "message_delta",
            "message_stop",
        ]);
        expect(events[2].data.delta).toEqual({
            type: "thinking_delta",
            thinking: "Think",
        });
        expect(events[3].data.delta).toEqual({
            type: "signature_delta",
            signature: "pollinations",
        });
        expect(events[6].data.delta).toEqual({
            type: "text_delta",
            text: "Hello",
        });
        expect(events[8].data.content_block).toEqual({
            type: "tool_use",
            id: "call_1",
            name: "weather",
            input: {},
        });
        expect(events[9].data.delta).toEqual({
            type: "input_json_delta",
            partial_json: '{"city":"Paris"}',
        });
        expect(events[11].data).toMatchObject({
            delta: {
                stop_reason: "tool_use",
                stop_sequence: null,
            },
            usage: {
                input_tokens: 9,
                output_tokens: 7,
                cache_creation_input_tokens: 1,
                cache_read_input_tokens: 2,
            },
        });
    });

    it("preserves Portkey Bedrock content_blocks thinking signatures live", async () => {
        const chunks = [
            {
                choices: [
                    {
                        index: 0,
                        delta: { role: "assistant" },
                        finish_reason: null,
                    },
                ],
            },
            {
                choices: [
                    {
                        index: 0,
                        delta: {
                            content_blocks: [
                                {
                                    index: 0,
                                    delta: { thinking: "Plan" },
                                },
                            ],
                        },
                        finish_reason: null,
                    },
                ],
            },
            {
                choices: [
                    {
                        index: 0,
                        delta: {
                            content_blocks: [
                                {
                                    index: 0,
                                    delta: {
                                        signature: "real-provider-signature",
                                    },
                                },
                            ],
                        },
                        finish_reason: null,
                    },
                ],
            },
            {
                choices: [
                    {
                        index: 0,
                        delta: {
                            content: "Done",
                            content_blocks: [
                                {
                                    index: 1,
                                    delta: { text: "Done" },
                                },
                            ],
                        },
                        finish_reason: null,
                    },
                ],
            },
            {
                choices: [
                    {
                        index: 0,
                        delta: {},
                        finish_reason: "stop",
                    },
                ],
                usage: {
                    prompt_tokens: 4,
                    completion_tokens: 3,
                    total_tokens: 7,
                },
            },
        ];
        const raw = `${chunks
            .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
            .join("")}data: [DONE]\n\n`;
        const text = await streamText(
            chatStreamToAnthropic(
                sourceStream(raw),
                "anthropic/claude-sonnet-4.6",
            ),
        );

        expect(text).toContain('"type":"thinking_delta","thinking":"Plan"');
        expect(text).toContain(
            '"type":"signature_delta","signature":"real-provider-signature"',
        );
        expect(text.match(/"type":"text_delta","text":"Done"/g)).toHaveLength(
            1,
        );
        expect(text).not.toContain(
            '"type":"signature_delta","signature":"pollinations"',
        );
        expect(text).toContain("event: message_stop");
    });

    it("ends with an Anthropic error when terminal usage is missing", async () => {
        const raw =
            'data: {"choices":[{"index":0,"delta":{"content":"Hi"},"finish_reason":null}]}\n\n' +
            'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n' +
            "data: [DONE]\n\n";
        const text = await streamText(
            chatStreamToAnthropic(sourceStream(raw), "openai/gpt-5.4-nano"),
        );
        expect(text).toContain("event: error");
        expect(text).toContain("omitted valid usage");
        expect(text).not.toContain("event: message_stop");
    });

    it("sends ping events while the upstream stream is silent", async () => {
        vi.useFakeTimers();
        try {
            const silent = new ReadableStream<Uint8Array<ArrayBuffer>>({
                start() {},
            });
            const reader = chatStreamToAnthropic(
                silent,
                "openai/gpt-5.4-nano",
            ).getReader();

            const first = await reader.read();
            expect(decoder.decode(first.value)).toContain(
                "event: message_start",
            );

            const ping = reader.read();
            await vi.advanceTimersByTimeAsync(ANTHROPIC_STREAM_HEARTBEAT_MS);
            const next = await ping;
            expect(decoder.decode(next.value)).toContain("event: ping");
            await reader.cancel();
        } finally {
            vi.useRealTimers();
        }
    });
});
