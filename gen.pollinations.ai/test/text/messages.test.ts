import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { getUserBalance } from "@shared/billing/balance.ts";
import type { TinybirdEvent } from "@shared/schemas/generation-event.ts";
import { createTestApiKey } from "@shared/test/fixtures/index.ts";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreateMessageRequestSchema } from "@/text/messages/schema.ts";
import { chatToMessagesStream } from "@/text/messages/stream.ts";
import {
    chatToMessagesResponse,
    messagesToChatRequest,
    toolUseInput,
} from "@/text/messages/translate.ts";
import worker from "../../src/index.ts";
import { withInlineGenerationCoordinator } from "../helpers/inline-generation-coordinator.ts";

afterEach(() => vi.restoreAllMocks());

const model = "openai/gpt-5.4-nano";
const encoder = new TextEncoder();

const usage = {
    prompt_tokens: 120,
    completion_tokens: 30,
    total_tokens: 150,
    prompt_tokens_details: { cached_tokens: 100, cache_write_tokens: 5 },
};

function sse(chunks: (object | string)[]): ReadableStream<Uint8Array> {
    return new ReadableStream({
        start(controller) {
            for (const chunk of chunks) {
                const data =
                    typeof chunk === "string" ? chunk : JSON.stringify(chunk);
                controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }
            controller.close();
        },
    });
}

type AnthropicEvent = { type: string; [key: string]: unknown };

function parseEvents(text: string): AnthropicEvent[] {
    return text
        .split("\n\n")
        .filter((frame) => frame.trim())
        .map((frame) => {
            const [eventLine, dataLine] = frame.split("\n");
            const event = JSON.parse(dataLine.slice("data: ".length));
            expect(eventLine).toBe(`event: ${event.type}`);
            return event;
        });
}

async function translateStream(chunks: (object | string)[]) {
    const text = await new Response(
        chatToMessagesStream(sse(chunks), model),
    ).text();
    return parseEvents(text);
}

function request(body: Record<string, unknown>) {
    return CreateMessageRequestSchema.parse({
        model,
        max_tokens: 1024,
        ...body,
    });
}

describe("Messages request translation", () => {
    it("keeps system blocks, mid-conversation system entries and cache_control", () => {
        const chat = messagesToChatRequest(
            request({
                system: [
                    {
                        type: "text",
                        text: "You are terse.",
                        cache_control: { type: "ephemeral", ttl: "1h" },
                    },
                ],
                messages: [
                    { role: "user", content: "hi" },
                    {
                        role: "system",
                        content: [{ type: "text", text: "Reminder" }],
                    },
                ],
                metadata: { user_id: "session-user" },
                context_management: { edits: [] },
            }),
        );
        expect(chat).toEqual({
            model,
            max_tokens: 1024,
            stream: false,
            messages: [
                {
                    role: "system",
                    content: [
                        {
                            type: "text",
                            text: "You are terse.",
                            cache_control: { type: "ephemeral" },
                        },
                    ],
                },
                { role: "user", content: "hi" },
                {
                    role: "system",
                    content: [{ type: "text", text: "Reminder" }],
                },
            ],
        });
    });

    it("turns tool use into tool calls and tool results into tool messages", () => {
        const chat = messagesToChatRequest(
            request({
                messages: [
                    {
                        role: "assistant",
                        content: [
                            {
                                type: "thinking",
                                thinking: "signed",
                                signature: "sig",
                            },
                            { type: "thinking", thinking: "unsigned" },
                            { type: "text", text: "Reading." },
                            {
                                type: "tool_use",
                                id: "toolu_1",
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
                                tool_use_id: "toolu_1",
                                content: [
                                    { type: "text", text: "file body" },
                                    {
                                        type: "image",
                                        source: {
                                            type: "url",
                                            url: "https://example.test/shot.png",
                                        },
                                    },
                                ],
                                cache_control: { type: "ephemeral" },
                            },
                            { type: "text", text: "Now edit it." },
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
                tools: [
                    {
                        name: "Read",
                        description: "Read a file",
                        input_schema: {
                            type: "object",
                            properties: { path: { type: "string" } },
                        },
                    },
                ],
                tool_choice: { type: "any", disable_parallel_tool_use: true },
                stop_sequences: ["END"],
            }),
        );
        expect(chat.messages).toEqual([
            {
                role: "assistant",
                content: [
                    { type: "thinking", thinking: "signed", signature: "sig" },
                    { type: "text", text: "Reading." },
                ],
                tool_calls: [
                    {
                        id: "toolu_1",
                        type: "function",
                        function: {
                            name: "Read",
                            arguments: '{"path":"a.ts"}',
                        },
                    },
                ],
            },
            {
                role: "tool",
                tool_call_id: "toolu_1",
                content: [{ type: "text", text: "file body" }],
                cache_control: { type: "ephemeral" },
            },
            {
                // Tool messages carry text only; the result's image leads.
                role: "user",
                content: [
                    {
                        type: "image_url",
                        image_url: { url: "https://example.test/shot.png" },
                    },
                    { type: "text", text: "Now edit it." },
                    {
                        type: "image_url",
                        image_url: { url: "data:image/png;base64,AAAA" },
                    },
                ],
            },
        ]);
        expect(chat).toMatchObject({
            tools: [
                {
                    type: "function",
                    function: {
                        name: "Read",
                        description: "Read a file",
                        parameters: { type: "object" },
                    },
                },
            ],
            tool_choice: "required",
            parallel_tool_calls: false,
            stop: ["END"],
        });
    });

    it.each([
        [{ type: "disabled" }, undefined, "none"],
        [{ type: "enabled", budget_tokens: 1024 }, undefined, "low"],
        [{ type: "enabled", budget_tokens: 10_000 }, undefined, "xhigh"],
        [{ type: "adaptive", display: "omitted" }, { effort: "high" }, "high"],
        [{ type: "adaptive" }, undefined, undefined],
    ])("maps thinking %j with output_config %j to reasoning_effort %s", (thinking, outputConfig, effort) => {
        const chat = messagesToChatRequest(
            request({
                messages: [{ role: "user", content: "hi" }],
                thinking,
                ...(outputConfig && { output_config: outputConfig }),
            }),
        );
        expect(chat.reasoning_effort).toBe(effort);
    });

    it("rejects server tools with the tag Claude Code recognizes", () => {
        expect(() =>
            messagesToChatRequest(
                request({
                    messages: [{ role: "user", content: "hi" }],
                    tools: [
                        { type: "web_search_20250305", name: "web_search" },
                    ],
                }),
            ),
        ).toThrow("Input tag 'web_search_20250305'");
    });
});

describe("Messages response translation", () => {
    it("returns thinking, text and tool use with Anthropic usage", () => {
        const message = chatToMessagesResponse(
            {
                id: "chatcmpl_1",
                object: "chat.completion",
                created: 1,
                choices: [
                    {
                        finish_reason: "tool_calls",
                        message: {
                            role: "assistant",
                            content: "Editing.",
                            reasoning_content: "Plan the edit.",
                            tool_calls: [
                                {
                                    id: "call_1",
                                    type: "function",
                                    function: {
                                        name: "Edit",
                                        arguments: '{"path":"a.ts"}',
                                    },
                                },
                            ],
                        },
                    },
                ],
                usage,
            },
            model,
        );
        expect(message).toEqual({
            id: "chatcmpl_1",
            type: "message",
            role: "assistant",
            model,
            content: [
                { type: "thinking", thinking: "Plan the edit.", signature: "" },
                { type: "text", text: "Editing." },
                {
                    type: "tool_use",
                    id: "call_1",
                    name: "Edit",
                    input: { path: "a.ts" },
                },
            ],
            stop_reason: "tool_use",
            stop_sequence: null,
            usage: {
                input_tokens: 15,
                output_tokens: 30,
                cache_read_input_tokens: 100,
                cache_creation_input_tokens: 5,
            },
        });
    });

    it("prefers signed provider thinking blocks and maps max_tokens", () => {
        const message = chatToMessagesResponse(
            {
                id: "chatcmpl_2",
                object: "chat.completion",
                created: 1,
                choices: [
                    {
                        finish_reason: "length",
                        message: {
                            role: "assistant",
                            content: "Partial",
                            reasoning_content: "duplicate",
                            content_blocks: [
                                {
                                    type: "thinking",
                                    thinking: "signed",
                                    signature: "sig",
                                },
                                { type: "text", text: "Partial" },
                            ],
                        },
                    },
                ],
                usage,
            },
            model,
        );
        expect(message.content).toEqual([
            { type: "thinking", thinking: "signed", signature: "sig" },
            { type: "text", text: "Partial" },
        ]);
        expect(message.stop_reason).toBe("max_tokens");
    });
});

describe("Messages stream translation", () => {
    it("rejects malformed tool arguments instead of silently replacing them", async () => {
        expect(() => toolUseInput('{"broken":')).toThrow();
        const events = await translateStream([
            {
                choices: [
                    {
                        delta: {
                            tool_calls: [
                                {
                                    index: 0,
                                    id: "t",
                                    function: {
                                        name: "Write",
                                        arguments: '{"broken":',
                                    },
                                },
                            ],
                        },
                    },
                ],
            },
            { choices: [], usage },
            "[DONE]",
        ]);
        expect(events.some((event) => event.type === "error")).toBe(true);
        expect(events.some((event) => event.type === "message_stop")).toBe(
            false,
        );
    });

    it("streams thinking and text blocks, then tool use and usage", async () => {
        const events = await translateStream([
            { choices: [{ delta: { reasoning_content: "Think" } }] },
            {
                choices: [
                    {
                        delta: {
                            content_blocks: [{ delta: { signature: "sig" } }],
                        },
                    },
                ],
            },
            { choices: [{ delta: { content: "Hel" } }] },
            { choices: [{ delta: { content: "lo" } }] },
            {
                choices: [
                    {
                        delta: {
                            tool_calls: [
                                {
                                    index: 0,
                                    id: "call_1",
                                    function: {
                                        name: "Bash",
                                        arguments: '{"co',
                                    },
                                },
                            ],
                        },
                    },
                ],
            },
            {
                choices: [
                    {
                        delta: {
                            tool_calls: [
                                {
                                    index: 0,
                                    function: { arguments: 'mmand":"ls"}' },
                                },
                            ],
                        },
                        finish_reason: "tool_calls",
                    },
                ],
            },
            { choices: [], usage },
            "[DONE]",
        ]);
        expect(events.map((event) => event.type)).toEqual([
            "message_start",
            "content_block_start",
            "content_block_delta",
            "content_block_delta",
            "content_block_stop",
            "content_block_start",
            "content_block_delta",
            "content_block_delta",
            "content_block_stop",
            "content_block_start",
            "content_block_delta",
            "content_block_stop",
            "message_delta",
            "message_stop",
        ]);
        expect(events[1]).toMatchObject({
            index: 0,
            content_block: { type: "thinking" },
        });
        expect(events[3]).toMatchObject({
            delta: { type: "signature_delta", signature: "sig" },
        });
        expect(events[7]).toMatchObject({
            index: 1,
            delta: { type: "text_delta", text: "lo" },
        });
        expect(events[9]).toMatchObject({
            index: 2,
            content_block: { type: "tool_use", id: "call_1", name: "Bash" },
        });
        expect(events[10]).toMatchObject({
            delta: {
                type: "input_json_delta",
                partial_json: '{"command":"ls"}',
            },
        });
        expect(events[12]).toMatchObject({
            delta: { stop_reason: "tool_use" },
            usage: {
                input_tokens: 15,
                output_tokens: 30,
                cache_read_input_tokens: 100,
                cache_creation_input_tokens: 5,
            },
        });
    });

    it("emits interleaved parallel tool calls as separate blocks", async () => {
        const call = (index: number, fields: object) => ({
            choices: [{ delta: { tool_calls: [{ index, ...fields }] } }],
        });
        const events = await translateStream([
            call(0, {
                id: "call_a",
                function: { name: "Read", arguments: "" },
            }),
            call(1, {
                id: "call_b",
                function: { name: "Grep", arguments: "" },
            }),
            call(1, { function: { arguments: '{"pattern":' } }),
            call(0, { function: { arguments: '{"path":"a.ts"}' } }),
            call(1, { function: { arguments: '"TODO"}' } }),
            { choices: [{ delta: {}, finish_reason: "tool_calls" }], usage },
            "[DONE]",
        ]);
        const blocks = events.filter(
            (event) => event.type === "content_block_start",
        );
        const inputs = events.filter(
            (event) => event.type === "content_block_delta",
        );
        expect(blocks.map((event) => event.content_block)).toMatchObject([
            { type: "tool_use", id: "call_a", name: "Read" },
            { type: "tool_use", id: "call_b", name: "Grep" },
        ]);
        expect(inputs.map((event) => event.delta)).toEqual([
            { type: "input_json_delta", partial_json: '{"path":"a.ts"}' },
            { type: "input_json_delta", partial_json: '{"pattern":"TODO"}' },
        ]);
        expect(events.at(-2)).toMatchObject({
            delta: { stop_reason: "tool_use" },
        });
    });

    it.each([
        {
            name: "usage is missing",
            chunks: [{ choices: [{ delta: { content: "hi" } }] }, "[DONE]"],
        },
        {
            name: "the provider sends an error",
            chunks: [
                { choices: [{ delta: { content: "hi" } }] },
                { error: { message: "usage_missing" } },
            ],
        },
        {
            name: "the stream ends early",
            chunks: [{ choices: [{ delta: { content: "hi" } }] }],
        },
    ])("ends with an error event when $name", async ({ chunks }) => {
        const events = await translateStream(chunks);
        expect(events.at(-1)).toMatchObject({
            type: "error",
            error: { type: "api_error" },
        });
        expect(events.map((event) => event.type)).not.toContain("message_stop");
    });

    it("sends pings while the provider is silent", async () => {
        let release: () => void = () => {};
        const body = new ReadableStream<Uint8Array>({
            async start(controller) {
                await new Promise<void>((resolve) => {
                    release = resolve;
                });
                controller.enqueue(
                    encoder.encode(
                        `data: ${JSON.stringify({ choices: [], usage })}\n\ndata: [DONE]\n\n`,
                    ),
                );
                controller.close();
            },
        });
        const reader = chatToMessagesStream(body, model, 30).getReader();
        const decoder = new TextDecoder();
        expect(decoder.decode((await reader.read()).value)).toContain(
            "event: message_start",
        );
        expect(decoder.decode((await reader.read()).value)).toContain(
            "event: ping",
        );
        release();
        let rest = "";
        for (
            let chunk = await reader.read();
            !chunk.done;
            chunk = await reader.read()
        ) {
            rest += decoder.decode(chunk.value);
        }
        expect(rest).toContain("event: message_stop");
    });
});

describe("POST /v1/messages", () => {
    beforeEach(async () => {
        await env.KV.put(
            "model-stats-v3",
            JSON.stringify({
                value: { data: [{ model, avg_cost_usd: 0.001 }] },
                ttl: 3600,
            }),
        );
    });

    /** Mock the provider and Tinybird; returns what each received. */
    function mockUpstream(options: { withUsage?: boolean } = {}): {
        events: TinybirdEvent[];
        providerBodies: Record<string, unknown>[];
    } {
        const events: TinybirdEvent[] = [];
        const providerBodies: Record<string, unknown>[] = [];
        const providerUsage = options.withUsage === false ? {} : { usage };
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                const upstream = new Request(input, init);
                if (new URL(upstream.url).pathname === "/v0/events") {
                    events.push(
                        ...(await upstream.text())
                            .trim()
                            .split("\n")
                            .map((line) => JSON.parse(line)),
                    );
                    return Response.json({});
                }
                const body = (await upstream.json().catch(() => null)) as {
                    messages?: unknown;
                    stream?: boolean;
                } | null;
                if (!body?.messages) return Response.json({ data: [] });
                providerBodies.push(body);
                if (body.stream) {
                    return new Response(
                        sse([
                            { choices: [{ delta: { content: "Hello" } }] },
                            {
                                choices: [{ delta: {}, finish_reason: "stop" }],
                            },
                            { choices: [], ...providerUsage },
                            "[DONE]",
                        ]),
                        { headers: { "content-type": "text/event-stream" } },
                    );
                }
                return Response.json({
                    id: "chatcmpl_test",
                    object: "chat.completion",
                    created: 1,
                    model,
                    choices: [
                        {
                            index: 0,
                            finish_reason: "stop",
                            message: { role: "assistant", content: "Hello" },
                        },
                    ],
                    ...providerUsage,
                });
            },
        );
        return { events, providerBodies };
    }

    async function call(
        path: "/v1/messages" | "/v1/chat/completions",
        body: Record<string, unknown>,
        key?: string,
    ) {
        const bindings = {
            ...withInlineGenerationCoordinator(env),
            TINYBIRD_INGEST_URL:
                "https://tinybird.test/v0/events?name=generation_event_v2",
        };
        const ctx = createExecutionContext();
        const response = await worker.fetch(
            new Request(`https://gen.pollinations.ai${path}?beta=true`, {
                method: "POST",
                headers: {
                    ...(key && { Authorization: `Bearer ${key}` }),
                    "Content-Type": "application/json",
                    "anthropic-version": "2023-06-01",
                    "anthropic-beta": "interleaved-thinking-2025-05-14",
                },
                body: JSON.stringify(body),
            }),
            bindings,
            ctx,
        );
        const text = await response.text();
        await waitOnExecutionContext(ctx);
        return { response, text };
    }

    it.each([
        false,
        true,
    ])("bills like Chat Completions with stream=%s", async (stream) => {
        const caller = await createTestApiKey({ user: { tierBalance: 100 } });
        const { events, providerBodies } = mockUpstream();
        const db = drizzle(env.DB);

        const chat = await call(
            "/v1/chat/completions",
            {
                model,
                stream,
                messages: [{ role: "user", content: `chat ${stream}` }],
            },
            caller.key,
        );
        expect(chat.response.status, chat.text).toBe(200);
        const afterChat = await getUserBalance(db, caller.userId);

        const messages = await call(
            "/v1/messages",
            {
                model,
                stream,
                max_tokens: 256,
                messages: [{ role: "user", content: `messages ${stream}` }],
                thinking: { type: "adaptive" },
                metadata: { user_id: "claude-code-user" },
            },
            caller.key,
        );
        expect(messages.response.status, messages.text).toBe(200);
        const afterMessages = await getUserBalance(db, caller.userId);

        const expectedUsage = {
            input_tokens: 15,
            output_tokens: 30,
            cache_read_input_tokens: 100,
            cache_creation_input_tokens: 5,
        };
        if (stream) {
            expect(messages.response.headers.get("content-type")).toContain(
                "text/event-stream",
            );
            const parsed = parseEvents(messages.text);
            expect(parsed.at(-1)).toMatchObject({ type: "message_stop" });
            expect(parsed.at(-2)).toMatchObject({
                delta: { stop_reason: "end_turn" },
                usage: expectedUsage,
            });
        } else {
            expect(JSON.parse(messages.text)).toMatchObject({
                type: "message",
                model,
                content: [{ type: "text", text: "Hello" }],
                stop_reason: "end_turn",
                usage: expectedUsage,
            });
        }
        expect(providerBodies[1].messages).toEqual([
            { role: "user", content: `messages ${stream}` },
        ]);
        expect(providerBodies[1]).not.toHaveProperty("metadata");

        // One billed event each, at the same price, charged once each.
        const billed = events.filter((event) => event.isBilledUsage);
        expect(billed).toHaveLength(2);
        expect(billed[1].totalPrice).toBeGreaterThan(0);
        expect(billed[1].totalPrice).toBe(billed[0].totalPrice);
        expect(billed[1].tokenCountPromptCached).toBe(
            billed[0].tokenCountPromptCached,
        );
        const chatCharge = 100 - afterChat.tierBalance;
        expect(afterChat.tierBalance - afterMessages.tierBalance).toBeCloseTo(
            chatCharge,
            10,
        );
    });

    it.each([
        false,
        true,
    ])("fails without provider usage and is not billed, stream=%s", async (stream) => {
        const caller = await createTestApiKey({ user: { tierBalance: 100 } });
        const { events } = mockUpstream({ withUsage: false });
        const { response, text } = await call(
            "/v1/messages",
            {
                model,
                stream,
                max_tokens: 256,
                messages: [{ role: "user", content: `no usage ${stream}` }],
            },
            caller.key,
        );
        if (stream) {
            expect(response.status).toBe(200);
            expect(parseEvents(text).at(-1)).toMatchObject({
                type: "error",
                error: { type: "api_error" },
            });
        } else {
            expect(response.status).toBe(502);
            expect(JSON.parse(text)).toMatchObject({
                type: "error",
                error: { type: "api_error" },
            });
        }
        expect(events.filter((event) => event.isBilledUsage)).toEqual([]);
        expect(
            (await getUserBalance(drizzle(env.DB), caller.userId)).tierBalance,
        ).toBe(100);
    });

    it.each([
        {
            name: "missing credentials",
            body: { model },
            auth: false,
            status: 401,
            type: "authentication_error",
        },
        {
            name: "an image model",
            body: { model: "flux" },
            auth: true,
            status: 400,
            type: "invalid_request_error",
        },
        {
            name: "a missing max_tokens",
            body: { model, max_tokens: undefined },
            auth: true,
            status: 400,
            type: "invalid_request_error",
        },
    ])("returns an Anthropic error for $name", async ({
        body,
        auth,
        status,
        type,
    }) => {
        const caller = await createTestApiKey({ user: { tierBalance: 100 } });
        mockUpstream();
        const { response, text } = await call(
            "/v1/messages",
            {
                max_tokens: 256,
                messages: [{ role: "user", content: "hi" }],
                ...body,
            },
            auth ? caller.key : undefined,
        );
        expect(response.status, text).toBe(status);
        expect(JSON.parse(text)).toMatchObject({
            type: "error",
            error: { type },
        });
    });

    it("lists /v1/messages for text models only", async () => {
        const ctx = createExecutionContext();
        const response = await worker.fetch(
            new Request("https://gen.pollinations.ai/v1/models"),
            env,
            ctx,
        );
        const { data } = (await response.json()) as {
            data: { id: string; supported_endpoints: string[] }[];
        };
        await waitOnExecutionContext(ctx);
        const endpoints = (id: string) =>
            data.find((entry) => entry.id === id)?.supported_endpoints;
        expect(endpoints(model)).toContain("/v1/messages");
        expect(endpoints("tongyi-mai/z-image-turbo")).toBeDefined();
        expect(endpoints("tongyi-mai/z-image-turbo")).not.toContain(
            "/v1/messages",
        );
    });
});
