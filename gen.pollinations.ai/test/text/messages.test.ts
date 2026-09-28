import type { CreateChatCompletionResponse } from "@shared/schemas/openai.ts";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env.ts";
import { anthropicErrors } from "@/text/messages/errors.ts";
import {
    type CreateMessageRequest,
    messagesToChatRequest,
} from "@/text/messages/request.ts";
import { chatToMessage } from "@/text/messages/response.ts";
import { chatStreamToMessageStream } from "@/text/messages/stream.ts";

afterEach(() => vi.useRealTimers());

const request = (extra: Record<string, unknown>): CreateMessageRequest => ({
    model: "m",
    max_tokens: 100,
    messages: [{ role: "user", content: "hi" }],
    ...extra,
});

const translate = (
    message: CreateMessageRequest,
    servedModel = "anthropic/claude-haiku-4.5",
) => messagesToChatRequest(message, servedModel);

describe("messagesToChatRequest", () => {
    it("keeps plain system text a string and cache_control blocks as parts", () => {
        const plain = translate(
            request({
                system: [
                    { type: "text", text: "a" },
                    { type: "text", text: "b" },
                ],
            }),
        );
        expect(plain.messages[0]).toEqual({
            role: "system",
            content: "a\n\nb",
        });

        const cached = translate(
            request({
                system: [
                    {
                        type: "text",
                        text: "a",
                        cache_control: { type: "ephemeral" },
                    },
                ],
            }),
        );
        expect(cached.messages[0]).toEqual({
            role: "system",
            content: [
                {
                    type: "text",
                    text: "a",
                    cache_control: { type: "ephemeral" },
                },
            ],
        });
    });

    it("drops cache_control for models that cannot use it", () => {
        const chat = translate(
            request({
                system: [
                    {
                        type: "text",
                        text: "a",
                        cache_control: { type: "ephemeral" },
                    },
                ],
            }),
            "z-ai/glm-5.3-flash",
        );
        expect(chat.messages[0]).toEqual({ role: "system", content: "a" });
    });

    it("preserves cache_control inside tool schemas and arguments", () => {
        const input = { cache_control: "user data" };
        const properties = { cache_control: { type: "string" } };
        const chat = translate(
            request({
                tools: [
                    {
                        name: "save",
                        input_schema: { type: "object", properties },
                    },
                ],
                messages: [
                    {
                        role: "assistant",
                        content: [
                            { type: "tool_use", id: "t1", name: "save", input },
                        ],
                    },
                ],
            }),
            "z-ai/glm-5.3-flash",
        );
        expect(chat.tools?.[0]).toMatchObject({
            function: { parameters: { properties } },
        });
        expect(chat.messages[0]).toMatchObject({
            tool_calls: [{ function: { arguments: JSON.stringify(input) } }],
        });
    });

    it("maps tool calls, tool results and images", () => {
        const chat = translate(
            request({
                messages: [
                    {
                        role: "assistant",
                        content: [
                            {
                                type: "thinking",
                                thinking: "hm",
                                signature: "s",
                            },
                            { type: "text", text: "reading" },
                            {
                                type: "tool_use",
                                id: "t1",
                                name: "Read",
                                input: { path: "a.ts" },
                            },
                        ],
                    },
                    {
                        role: "user",
                        content: [
                            {
                                type: "tool_result",
                                tool_use_id: "t1",
                                content: [{ type: "text", text: "file" }],
                            },
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
                ],
            }),
        );
        expect(chat.messages).toEqual([
            {
                role: "assistant",
                content: "reading",
                tool_calls: [
                    {
                        id: "t1",
                        type: "function",
                        function: {
                            name: "Read",
                            arguments: '{"path":"a.ts"}',
                        },
                    },
                ],
            },
            { role: "tool", tool_call_id: "t1", content: "file" },
            {
                role: "user",
                content: [
                    {
                        type: "image_url",
                        image_url: { url: "data:image/png;base64,AAAA" },
                    },
                ],
            },
        ]);
    });

    it("maps tools, tool choice, stop sequences and sampling", () => {
        const chat = translate(
            request({
                tools: [
                    {
                        name: "Read",
                        description: "read",
                        input_schema: { type: "object" },
                        cache_control: { type: "ephemeral" },
                    },
                    { type: "web_search_20250305", name: "web_search" },
                ],
                tool_choice: { type: "any", disable_parallel_tool_use: true },
                stop_sequences: ["END"],
                temperature: 0.2,
                stream: true,
            }),
        );
        expect(chat).toMatchObject({
            tools: [
                {
                    type: "function",
                    function: {
                        name: "Read",
                        description: "read",
                        parameters: { type: "object" },
                    },
                },
            ],
            tool_choice: "required",
            parallel_tool_calls: false,
            stop: ["END"],
            temperature: 0.2,
            stream: true,
            max_tokens: 100,
        });
        expect(chat.tools).toHaveLength(1);
    });

    it.each([
        [{ type: "adaptive" }, undefined, undefined],
        [{ type: "adaptive" }, { effort: "high" }, "high"],
        [{ type: "enabled", budget_tokens: 2000 }, undefined, "medium"],
        [{ type: "disabled" }, { effort: "high" }, undefined],
    ])("maps thinking %j and %j to reasoning effort", (thinking, config, effort) => {
        expect(
            translate(request({ thinking, output_config: config }))
                .reasoning_effort,
        ).toBe(effort);
    });
});

describe("chatToMessage", () => {
    const completion = (message: object, usage: object, finish = "stop") =>
        ({
            id: "c",
            object: "chat.completion",
            created: 0,
            choices: [{ index: 0, finish_reason: finish, message }],
            usage,
        }) as CreateChatCompletionResponse;

    it("returns reasoning, text and tool calls as content blocks", () => {
        const message = chatToMessage(
            completion(
                {
                    role: "assistant",
                    reasoning_content: "think",
                    content: "ok",
                    tool_calls: [
                        {
                            id: "t1",
                            type: "function",
                            function: { name: "Read", arguments: '{"a":1}' },
                        },
                    ],
                },
                { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            ),
            "served",
        );
        expect(message).toMatchObject({
            type: "message",
            role: "assistant",
            model: "served",
            content: [
                { type: "thinking", thinking: "think" },
                { type: "text", text: "ok" },
                { type: "tool_use", id: "t1", name: "Read", input: { a: 1 } },
            ],
            stop_reason: "tool_use",
        });
    });

    it("returns Claude thinking blocks as thinking", () => {
        const { content } = chatToMessage(
            completion(
                {
                    role: "assistant",
                    content: "ok",
                    content_blocks: [
                        { type: "thinking", thinking: "hm", signature: "s" },
                        { type: "text", text: "ok" },
                    ],
                },
                { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            ),
            "served",
        );
        expect(content).toMatchObject([
            { type: "thinking", thinking: "hm" },
            { type: "text", text: "ok" },
        ]);
    });

    it("reports cache reads and writes apart from input tokens", () => {
        const { usage } = chatToMessage(
            completion(
                { role: "assistant", content: "ok" },
                {
                    prompt_tokens: 100,
                    completion_tokens: 20,
                    total_tokens: 120,
                    prompt_tokens_details: {
                        cached_tokens: 60,
                        cache_write_tokens: 10,
                    },
                },
                "length",
            ),
            "served",
        );
        expect(usage).toEqual({
            input_tokens: 30,
            output_tokens: 20,
            cache_creation_input_tokens: 10,
            cache_read_input_tokens: 60,
        });
    });
});

const encoder = new TextEncoder();
const chunk = (data: object | string) =>
    `data: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`;
const delta = (d: object, finish: string | null = null) =>
    chunk({ choices: [{ index: 0, delta: d, finish_reason: finish }] });

function upstream(text: string) {
    return new ReadableStream<Uint8Array<ArrayBuffer>>({
        start(controller) {
            controller.enqueue(encoder.encode(text));
            controller.close();
        },
    });
}

async function events(stream: ReadableStream<Uint8Array>) {
    const text = await new Response(stream).text();
    return text
        .trim()
        .split("\n\n")
        .map((block) => {
            const [event, data] = block.split("\n");
            return {
                event: event.slice("event: ".length),
                data: JSON.parse(data.slice("data: ".length)),
            };
        });
}

describe("chatStreamToMessageStream", () => {
    it("keeps interleaved parallel tool calls in two complete blocks", async () => {
        const out = await events(
            chatStreamToMessageStream(
                upstream(
                    delta({
                        tool_calls: [
                            {
                                index: 0,
                                id: "a",
                                function: {
                                    name: "Read",
                                    arguments: '{"path":',
                                },
                            },
                            {
                                index: 1,
                                id: "b",
                                function: {
                                    name: "Read",
                                    arguments: '{"path":',
                                },
                            },
                        ],
                    }) +
                        delta({
                            tool_calls: [
                                { index: 0, function: { arguments: '"a"}' } },
                                { index: 1, function: { arguments: '"b"}' } },
                            ],
                        }) +
                        chunk({
                            choices: [],
                            usage: {
                                prompt_tokens: 10,
                                completion_tokens: 5,
                                total_tokens: 15,
                            },
                        }) +
                        chunk("[DONE]"),
                ),
                "served",
            ),
        );
        expect(
            out
                .filter(({ event }) => event === "content_block_start")
                .map(({ data }) => data.content_block.id),
        ).toEqual(["a", "b"]);
        for (const [index, path] of ["a", "b"].entries()) {
            const args = out
                .filter(
                    ({ event, data }) =>
                        event === "content_block_delta" && data.index === index,
                )
                .map(({ data }) => data.delta.partial_json)
                .join("");
            expect(JSON.parse(args)).toEqual({ path });
        }
    });

    it("emits one block at a time in Anthropic order, with usage at the end", async () => {
        const sse =
            delta({ role: "assistant", reasoning_content: "hm" }) +
            delta({ content: "Hel" }) +
            delta({ content: "lo" }) +
            delta({
                tool_calls: [
                    {
                        index: 0,
                        id: "t1",
                        function: { name: "Read", arguments: '{"a"' },
                    },
                ],
            }) +
            delta({
                tool_calls: [{ index: 0, function: { arguments: ":1}" } }],
            }) +
            delta({}, "tool_calls") +
            chunk({
                choices: [],
                usage: {
                    prompt_tokens: 10,
                    completion_tokens: 5,
                    total_tokens: 15,
                },
            }) +
            chunk("[DONE]");
        const out = await events(
            chatStreamToMessageStream(upstream(sse), "served"),
        );

        expect(out.map(({ event }) => event)).toEqual([
            "message_start",
            "content_block_start",
            "content_block_delta",
            "content_block_stop",
            "content_block_start",
            "content_block_delta",
            "content_block_delta",
            "content_block_stop",
            "content_block_start",
            "content_block_delta",
            "content_block_delta",
            "content_block_stop",
            "message_delta",
            "message_stop",
        ]);
        expect(out[0].data.message.model).toBe("served");
        expect(out[1].data).toMatchObject({
            index: 0,
            content_block: { type: "thinking" },
        });
        expect(out[6].data).toMatchObject({
            index: 1,
            delta: { type: "text_delta", text: "lo" },
        });
        expect(out[8].data).toMatchObject({
            index: 2,
            content_block: { type: "tool_use", id: "t1", name: "Read" },
        });
        expect(out[10].data.delta).toEqual({
            type: "input_json_delta",
            partial_json: ":1}",
        });
        expect(out[12].data).toEqual({
            type: "message_delta",
            delta: { stop_reason: "tool_use", stop_sequence: null },
            usage: {
                input_tokens: 10,
                output_tokens: 5,
                cache_creation_input_tokens: 0,
                cache_read_input_tokens: 0,
            },
        });
    });

    it("streams Claude thinking content blocks as thinking, text once", async () => {
        const sse =
            delta({
                content_blocks: [{ index: 0, delta: { thinking: "hm" } }],
            }) +
            delta(
                {
                    content: "ok",
                    content_blocks: [{ index: 1, delta: { text: "ok" } }],
                },
                "stop",
            ) +
            chunk({
                choices: [],
                usage: {
                    prompt_tokens: 1,
                    completion_tokens: 1,
                    total_tokens: 2,
                },
            }) +
            chunk("[DONE]");
        const out = await events(
            chatStreamToMessageStream(upstream(sse), "served"),
        );
        expect(out.map(({ data }) => data.delta?.type ?? data.type)).toEqual([
            "message_start",
            "content_block_start",
            "thinking_delta",
            "content_block_stop",
            "content_block_start",
            "text_delta",
            "content_block_stop",
            "message_delta",
            "message_stop",
        ]);
    });

    it("ends with an error event, not message_stop, when the chat stream failed", async () => {
        const sse =
            delta({ content: "partial" }) +
            chunk({
                error: {
                    message: "provider omitted usage",
                    code: "usage_missing",
                },
            });
        const out = await events(
            chatStreamToMessageStream(upstream(sse), "served"),
        );
        expect(out.at(-1)).toEqual({
            event: "error",
            data: {
                type: "error",
                error: { type: "api_error", message: "provider omitted usage" },
            },
        });
        expect(out.map(({ event }) => event)).not.toContain("message_stop");
    });

    it("sends ping events while the upstream is silent", async () => {
        vi.useFakeTimers();
        const silent = new ReadableStream<Uint8Array<ArrayBuffer>>();
        const reader = chatStreamToMessageStream(silent, "served").getReader();
        const decode = (value?: Uint8Array) => new TextDecoder().decode(value);

        expect(decode((await reader.read()).value)).toContain("message_start");
        const next = reader.read();
        await vi.advanceTimersByTimeAsync(15_000);
        expect(decode((await next).value)).toBe(
            'event: ping\ndata: {"type":"ping"}\n\n',
        );
    });
});

describe("anthropicErrors", () => {
    const failing = (status: number, headers: Record<string, string> = {}) =>
        new Hono<Env>().use(anthropicErrors).post("/", (c) =>
            c.json(
                {
                    success: false,
                    status,
                    error: {
                        message: "no",
                        details: { fieldErrors: { messages: ["Required"] } },
                    },
                },
                status as 400,
                headers,
            ),
        );

    it.each([
        [400, "invalid_request_error"],
        [401, "authentication_error"],
        [402, "billing_error"],
        [429, "rate_limit_error"],
        [502, "api_error"],
    ])("maps %i to %s and keeps the status", async (status, type) => {
        const response = await failing(status).request("/", { method: "POST" });
        expect(response.status).toBe(status);
        expect(await response.json()).toMatchObject({
            type: "error",
            error: { type, message: "no; messages: Required" },
        });
    });

    it("returns integer retry-after seconds on 429", async () => {
        const kept = await failing(429, { "retry-after": "3" }).request("/", {
            method: "POST",
        });
        expect(kept.headers.get("retry-after")).toBe("3");
        const added = await failing(429).request("/", { method: "POST" });
        expect(added.headers.get("retry-after")).toBe("10");
    });
});
