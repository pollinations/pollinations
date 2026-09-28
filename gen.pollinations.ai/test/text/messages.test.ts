import { createExecutionContext, env } from "cloudflare:test";
import { validator } from "@shared/middleware/validator.ts";
import { TEXT_SERVICES } from "@shared/registry/text.ts";
import {
    type AnthropicMessagesRequest,
    AnthropicMessagesRequestSchema,
} from "@shared/schemas/anthropic.ts";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env.ts";
import type { LoggerVariables } from "@/middleware/logger.ts";
import {
    generateMessages,
    handleErrorForRoute,
} from "@/text/messages/handler.ts";
import {
    anthropicToChatRequest,
    UnsupportedContentError,
} from "@/text/messages/request.ts";
import {
    chatCompletionToAnthropicMessage,
    usageToAnthropic,
} from "@/text/messages/response.ts";
import { chatStreamToAnthropicEvents } from "@/text/messages/stream.ts";

const encoder = new TextEncoder();

function anthropicRequest(body: unknown): AnthropicMessagesRequest {
    return AnthropicMessagesRequestSchema.parse(body);
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("request translation", () => {
    it("maps system, sampling, stop sequences, and max_tokens", () => {
        const chat = anthropicToChatRequest(
            anthropicRequest({
                model: "llama-scout",
                system: "Be terse.",
                max_tokens: 128,
                temperature: 0.5,
                top_p: 0.9,
                stop_sequences: ["END"],
                messages: [
                    { role: "user", content: "Hi" },
                    { role: "assistant", content: "Hello" },
                    { role: "user", content: "Bye" },
                ],
            }),
            "meta/llama-4-scout",
        );
        expect(chat).toEqual({
            model: "meta/llama-4-scout",
            max_tokens: 128,
            messages: [
                { role: "system", content: "Be terse." },
                { role: "user", content: "Hi" },
                { role: "assistant", content: "Hello" },
                { role: "user", content: "Bye" },
            ],
            temperature: 0.5,
            top_p: 0.9,
            stop: ["END"],
            logit_bias: null,
            stream: false,
        });
    });

    it("keeps cache_control markers on system and user text blocks", () => {
        const chat = anthropicToChatRequest(
            anthropicRequest({
                model: "openai",
                max_tokens: 10,
                system: [
                    {
                        type: "text",
                        text: "Static prefix",
                        cache_control: { type: "ephemeral" },
                    },
                ],
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: "Hello",
                                cache_control: { type: "ephemeral" },
                            },
                        ],
                    },
                ],
            }),
            "openai",
        );
        expect(chat.messages[0]).toEqual({
            role: "system",
            content: [
                {
                    type: "text",
                    text: "Static prefix",
                    cache_control: { type: "ephemeral" },
                },
            ],
        });
        expect(chat.messages[1]).toEqual({
            role: "user",
            content: [
                {
                    type: "text",
                    text: "Hello",
                    cache_control: { type: "ephemeral" },
                },
            ],
        });
    });

    it("maps tool_result history to tool messages before the user turn", () => {
        const chat = anthropicToChatRequest(
            anthropicRequest({
                model: "openai",
                max_tokens: 10,
                messages: [
                    {
                        role: "assistant",
                        content: [
                            {
                                type: "tool_use",
                                id: "toolu_1",
                                name: "get_weather",
                                input: { city: "Berlin" },
                            },
                        ],
                    },
                    {
                        role: "user",
                        content: [
                            {
                                type: "tool_result",
                                tool_use_id: "toolu_1",
                                content: "21°C, clear",
                            },
                            { type: "text", text: "Summarize." },
                        ],
                    },
                ],
            }),
            "openai",
        );
        expect(chat.messages).toEqual([
            {
                role: "assistant",
                tool_calls: [
                    {
                        id: "toolu_1",
                        type: "function",
                        function: {
                            name: "get_weather",
                            arguments: '{"city":"Berlin"}',
                        },
                    },
                ],
            },
            { role: "tool", tool_call_id: "toolu_1", content: "21°C, clear" },
            { role: "user", content: [{ type: "text", text: "Summarize." }] },
        ]);
    });

    it("translates image blocks to image_url parts, base64 and url sources", () => {
        const chat = anthropicToChatRequest(
            anthropicRequest({
                model: "openai",
                max_tokens: 10,
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "image",
                                source: {
                                    type: "base64",
                                    media_type: "image/jpeg",
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
            }),
            "openai",
        );
        expect(chat.messages[0]).toEqual({
            role: "user",
            content: [
                {
                    type: "image_url",
                    image_url: {
                        url: "data:image/jpeg;base64,aGVsbG8=",
                    },
                },
                {
                    type: "image_url",
                    image_url: { url: "https://example.com/cat.png" },
                },
            ],
        });
    });

    it("drops assistant thinking history and keeps text plus tool_use", () => {
        const chat = anthropicToChatRequest(
            anthropicRequest({
                model: "openai",
                max_tokens: 10,
                messages: [
                    {
                        role: "assistant",
                        content: [
                            {
                                type: "thinking",
                                thinking: "hmm",
                                signature: "sig",
                            },
                            { type: "text", text: "Answer" },
                            {
                                type: "tool_use",
                                id: "toolu_2",
                                name: "search",
                                input: { q: "x" },
                            },
                        ],
                    },
                ],
            }),
            "openai",
        );
        expect(chat.messages).toEqual([
            {
                role: "assistant",
                content: "Answer",
                tool_calls: [
                    {
                        id: "toolu_2",
                        type: "function",
                        function: { name: "search", arguments: '{"q":"x"}' },
                    },
                ],
            },
        ]);
    });

    it("maps tools and tool_choice", () => {
        const base = {
            model: "openai",
            max_tokens: 10,
            messages: [{ role: "user", content: "Hi" }],
            tools: [
                {
                    name: "get_weather",
                    description: "Weather by city",
                    input_schema: {
                        type: "object",
                        properties: { city: { type: "string" } },
                    },
                },
            ],
        };
        expect(
            anthropicToChatRequest(anthropicRequest(base), "openai").tools,
        ).toEqual([
            {
                type: "function",
                function: {
                    name: "get_weather",
                    description: "Weather by city",
                    strict: false,
                    parameters: {
                        type: "object",
                        properties: { city: { type: "string" } },
                    },
                },
            },
        ]);
        expect(
            anthropicToChatRequest(
                anthropicRequest({ ...base, tool_choice: { type: "auto" } }),
                "openai",
            ).tool_choice,
        ).toBe("auto");
        expect(
            anthropicToChatRequest(
                anthropicRequest({ ...base, tool_choice: { type: "any" } }),
                "openai",
            ).tool_choice,
        ).toBe("required");
        expect(
            anthropicToChatRequest(
                anthropicRequest({
                    ...base,
                    tool_choice: { type: "tool", name: "get_weather" },
                }),
                "openai",
            ).tool_choice,
        ).toEqual({ type: "function", function: { name: "get_weather" } });
    });

    it("maps thinking budgets to reasoning effort levels", () => {
        const base = {
            model: "openai",
            max_tokens: 20000,
            messages: [{ role: "user", content: "Hi" }],
        };
        expect(
            anthropicToChatRequest(
                anthropicRequest({
                    ...base,
                    thinking: { type: "enabled", budget_tokens: 10000 },
                }),
                "openai",
            ).reasoning_effort,
        ).toBe("high");
        expect(
            anthropicToChatRequest(
                anthropicRequest({
                    ...base,
                    thinking: { type: "enabled", budget_tokens: 3000 },
                }),
                "openai",
            ).reasoning_effort,
        ).toBe("medium");
        expect(
            anthropicToChatRequest(
                anthropicRequest({
                    ...base,
                    thinking: { type: "enabled", budget_tokens: 1024 },
                }),
                "openai",
            ).reasoning_effort,
        ).toBe("low");
        expect(
            anthropicToChatRequest(
                anthropicRequest({
                    ...base,
                    thinking: { type: "enabled", budget_tokens: 1024 },
                }),
                "openai",
            ).stream,
        ).toBe(false);
        expect(
            anthropicToChatRequest(
                anthropicRequest({
                    ...base,
                    thinking: { type: "disabled" },
                }),
                "openai",
            ).reasoning_effort,
        ).toBeUndefined();
    });

    it("rejects unsupported content blocks instead of dropping them", () => {
        expect(() =>
            anthropicToChatRequest(
                anthropicRequest({
                    model: "openai",
                    max_tokens: 10,
                    messages: [
                        {
                            role: "user",
                            content: [{ type: "mystery", data: "x" }],
                        },
                    ],
                }),
                "openai",
            ),
        ).toThrow(UnsupportedContentError);
    });
});

describe("response translation", () => {
    it("builds an Anthropic message with text and tool_use blocks", () => {
        const message = chatCompletionToAnthropicMessage(
            {
                id: "chatcmpl-123",
                model: "meta/llama-4-scout",
                choices: [
                    {
                        finish_reason: "tool_calls",
                        message: {
                            role: "assistant",
                            content: "Let me check.",
                            tool_calls: [
                                {
                                    id: "call_1",
                                    function: {
                                        name: "get_weather",
                                        arguments: '{"city":"Berlin"}',
                                    },
                                },
                            ],
                        },
                    },
                ],
                usage: {
                    prompt_tokens: 10,
                    completion_tokens: 5,
                    total_tokens: 15,
                    prompt_tokens_details: { cached_tokens: 4 },
                },
            },
            "meta/llama-4-scout",
        );
        expect(message).toEqual({
            id: "msg_chatcmpl-123",
            type: "message",
            role: "assistant",
            model: "meta/llama-4-scout",
            content: [
                { type: "text", text: "Let me check." },
                {
                    type: "tool_use",
                    id: "call_1",
                    name: "get_weather",
                    input: { city: "Berlin" },
                },
            ],
            stop_reason: "tool_use",
            stop_sequence: null,
            usage: {
                input_tokens: 10,
                cache_creation_input_tokens: 0,
                cache_read_input_tokens: 4,
                output_tokens: 5,
            },
        });
    });

    it("maps reasoning content to a thinking block and length to max_tokens", () => {
        const message = chatCompletionToAnthropicMessage(
            {
                id: "chatcmpl-456",
                model: "openai",
                choices: [
                    {
                        finish_reason: "length",
                        message: {
                            role: "assistant",
                            content: "Truncat",
                            reasoning_content: "thinking hard",
                        },
                    },
                ],
                usage: {
                    prompt_tokens: 3,
                    completion_tokens: 2,
                    total_tokens: 5,
                },
            },
            "openai",
        );
        expect(message.content).toEqual([
            { type: "thinking", thinking: "thinking hard", signature: "" },
            { type: "text", text: "Truncat" },
        ]);
        expect(message.stop_reason).toBe("max_tokens");
    });

    it("always emits a text block for plain answers and never invents usage", () => {
        const message = chatCompletionToAnthropicMessage(
            {
                id: "chatcmpl-789",
                model: "openai",
                choices: [
                    {
                        finish_reason: "stop",
                        message: { role: "assistant", content: "Hi" },
                    },
                ],
                usage: {
                    prompt_tokens: 1,
                    completion_tokens: 1,
                    total_tokens: 2,
                    cache_creation_input_tokens: 7,
                },
            },
            "openai",
        );
        expect(message.content).toEqual([{ type: "text", text: "Hi" }]);
        expect(message.stop_reason).toBe("end_turn");
        expect(message.usage.cache_creation_input_tokens).toBe(7);
        expect(usageToAnthropic({})).toEqual({
            input_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            output_tokens: 0,
        });
    });
});

function sse(bytes: string): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(encoder.encode(bytes));
            controller.close();
        },
    });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<string[]> {
    const text = await new Response(stream).text();
    return text.split("\n\n").filter(Boolean);
}

describe("stream translation", () => {
    it("emits the full Anthropic event sequence for text streams", async () => {
        const events = await collect(
            chatStreamToAnthropicEvents(
                sse(
                    'data: {"id":"chatcmpl-1","model":"meta/llama-4-scout","choices":[{"delta":{"content":"Hi"}}]}\n\n' +
                        'data: {"id":"chatcmpl-1","choices":[{"delta":{"content":" there"},"finish_reason":"stop"}]}\n\n' +
                        'data: {"id":"chatcmpl-1","usage":{"prompt_tokens":2,"completion_tokens":2,"total_tokens":4,"prompt_tokens_details":{"cached_tokens":1}},"choices":[{"finish_reason":"stop"}]}\n\n' +
                        "data: [DONE]\n\n",
                ),
                { id: "msg_1", model: "meta/llama-4-scout" },
            ),
        );
        expect(events).toEqual([
            'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","model":"meta/llama-4-scout","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":0,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"output_tokens":0}}}',
            'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
            'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi"}}',
            'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" there"}}',
            'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}',
            'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"input_tokens":2,"cache_creation_input_tokens":0,"cache_read_input_tokens":1,"output_tokens":2}}',
            'event: message_stop\ndata: {"type":"message_stop"}',
        ]);
    });

    it("emits thinking and tool_use blocks with partial JSON arguments", async () => {
        const events = await collect(
            chatStreamToAnthropicEvents(
                sse(
                    'data: {"choices":[{"delta":{"reasoning_content":"Step 1"}}]}\n\n' +
                        'data: {"choices":[{"delta":{"content":"Answer"}}]}\n\n' +
                        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_9","function":{"name":"get_weather","arguments":"{\\"city\\":"}}]}}]}\n\n' +
                        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"Berlin\\"}"}}]}}]}\n\n' +
                        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n' +
                        'data: {"usage":{"prompt_tokens":1,"completion_tokens":9,"total_tokens":10}}\n\n' +
                        "data: [DONE]\n\n",
                ),
                { id: "msg_2", model: "openai" },
            ),
        );
        const datas = events.map((event) => event.split("data: ", 2)[1]);
        expect(datas[0]).toContain('"id":"msg_2"');
        const joined = datas.join("\n");
        expect(joined).toContain('"thinking_delta","thinking":"Step 1"');
        expect(joined).toContain('"text_delta","text":"Answer"');
        expect(joined).toContain(
            '"content_block":{"type":"tool_use","id":"call_9","name":"get_weather","input":{}}',
        );
        expect(joined).toContain(
            '"input_json_delta","partial_json":"{\\"city\\":',
        );
        expect(joined).toContain(
            '"input_json_delta","partial_json":"\\"Berlin\\"}"',
        );
        expect(joined).toContain('"stop_reason":"tool_use"');
        expect(joined).toContain('"output_tokens":9');
        // Argument fragments arrive in order across consecutive deltas.
        const firstFragment = joined.indexOf("partial_json");
        const lastFragment = joined.lastIndexOf("partial_json");
        expect(firstFragment).toBeGreaterThan(-1);
        expect(firstFragment).toBeLessThan(lastFragment);
        // thinking opens block 0, text opens block 1, tool_use opens block 2.
        expect(
            events.filter((e) => e.startsWith("event: content_block_start")),
        ).toHaveLength(3);
        expect(events.at(-1)).toBe(
            'event: message_stop\ndata: {"type":"message_stop"}',
        );
    });

    it("translates the pipeline missing-usage error event and skips message_stop", async () => {
        const events = await collect(
            chatStreamToAnthropicEvents(
                sse(
                    'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n' +
                        'data: {"error":{"message":"Provider did not report usage","type":"upstream_error"}}\n\n',
                ),
                { id: "msg_3", model: "openai" },
            ),
        );
        expect(events).toEqual([
            'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_3","type":"message","role":"assistant","model":"openai","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":0,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"output_tokens":0}}}',
            'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
            'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi"}}',
            'event: error\ndata: {"type":"error","error":{"type":"api_error","message":"Provider did not report usage","upstream_type":"upstream_error"}}',
        ]);
        expect(events.some((e) => e.includes("message_stop"))).toBe(false);
    });

    it("fails a stream that ends with neither usage nor an error event", async () => {
        const events = await collect(
            chatStreamToAnthropicEvents(
                sse(
                    'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n' +
                        "data: [DONE]\n\n",
                ),
                { id: "msg_4", model: "openai" },
            ),
        );
        expect(events.find((e) => e.startsWith("event: error"))).toContain(
            "Upstream provider ended without terminal usage",
        );
        expect(events.some((e) => e.includes("message_stop"))).toBe(false);
    });
});

const testLog = {
    getChild: () => testLog,
    debug() {},
    info() {},
    warn() {},
    error() {},
} as unknown as LoggerVariables["log"];

function messagesApp(upstream: () => Response): Hono<Env> {
    const app = new Hono<Env>();
    app.onError(handleErrorForRoute);
    app.use("*", async (c, next) => {
        const body = (await c.req.json().catch(() => ({}))) as {
            stream?: boolean;
        };
        c.set("log", testLog);
        c.set("requestId", "test-request");
        c.set("track", {
            modelRequested: "llama-scout",
            resolvedModelRequested: "meta/llama-4-scout",
            streamRequested: body.stream === true,
            overrideResponseTracking() {},
            setPricingInput() {},
            attempts: [],
        });
        c.set("model", {
            requested: "llama-scout",
            resolved: "meta/llama-4-scout",
            // perUserRpm stripped so the pipeline skips the Durable Object
            // rate limiter, which is not under test here.
            definition: {
                ...TEXT_SERVICES["meta/llama-4-scout"],
                perUserRpm: undefined,
            },
        });
        await next();
    });
    app.post(
        "/v1/messages",
        validator("json", AnthropicMessagesRequestSchema),
        generateMessages,
    );
    app.post("/v1/chat/completions", () => upstream());
    vi.stubGlobal(
        "fetch",
        vi.fn(() => upstream()),
    );
    return app;
}

const openAiCompletion = {
    id: "chatcmpl-route",
    object: "chat.completion",
    model: "meta/llama-4-scout",
    choices: [
        {
            index: 0,
            finish_reason: "stop",
            message: {
                role: "assistant",
                content: "Blue because Rayleigh scattering.",
            },
        },
    ],
    usage: {
        prompt_tokens: 12,
        completion_tokens: 34,
        total_tokens: 46,
        prompt_tokens_details: { cached_tokens: 2 },
    },
};

const anthropicBody = {
    model: "llama-scout",
    max_tokens: 256,
    messages: [{ role: "user", content: "Why is the sky blue?" }],
};

describe("POST /v1/messages route", () => {
    it("returns an Anthropic message JSON with parity usage numbers and headers", async () => {
        const app = messagesApp(() => Response.json(openAiCompletion));
        const response = await app.request(
            "/v1/messages",
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(anthropicBody),
            },
            env,
            createExecutionContext(),
        );
        expect(response.status).toBe(200);
        const body = (await response.json()) as {
            type: string;
            content: { type: string; text: string }[];
            usage: Record<string, number>;
        };
        expect(body.type).toBe("message");
        expect(body.content).toEqual([
            {
                type: "text",
                text: "Blue because Rayleigh scattering.",
            },
        ]);
        expect(body.usage).toEqual({
            input_tokens: 12,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 2,
            output_tokens: 34,
        });
        // Billing parity: the same usage headers Chat Completions reports
        // (prompt tokens are net of cache-read tokens).
        expect(response.headers.get("x-usage-prompt-text-tokens")).toBe("10");
        expect(response.headers.get("x-usage-completion-text-tokens")).toBe(
            "34",
        );
        expect(response.headers.get("x-model-used")).toBe("meta/llama-4-scout");
    });

    it("streams Anthropic events with terminal usage", async () => {
        const app = messagesApp(
            () =>
                new Response(
                    sse(
                        'data: {"id":"chatcmpl-s","model":"meta/llama-4-scout","choices":[{"delta":{"content":"Hi"}}]}\n\n' +
                            'data: {"id":"chatcmpl-s","choices":[{"delta":{},"finish_reason":"stop"}]}\n\n' +
                            'data: {"id":"chatcmpl-s","usage":{"prompt_tokens":7,"completion_tokens":2,"total_tokens":9}}\n\n' +
                            "data: [DONE]\n\n",
                    ),
                    { headers: { "content-type": "text/event-stream" } },
                ),
        );
        const response = await app.request(
            "/v1/messages",
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ ...anthropicBody, stream: true }),
            },
            env,
            createExecutionContext(),
        );
        expect(response.headers.get("content-type")).toContain(
            "text/event-stream",
        );
        const text = await response.text();
        expect(text).toContain("event: message_start");
        expect(text).toContain('"text_delta","text":"Hi"');
        expect(text).toContain('"output_tokens":2');
        expect(text).toContain("event: message_stop");
        expect(text.trim().endsWith('data: {"type":"message_stop"}')).toBe(
            true,
        );
    });

    it("fails an Anthropic-shaped 502 when the provider omits usage", async () => {
        const app = messagesApp(() =>
            Response.json({ ...openAiCompletion, usage: undefined }),
        );
        const response = await app.request(
            "/v1/messages",
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(anthropicBody),
            },
            env,
            createExecutionContext(),
        );
        expect(response.status).toBe(502);
        const body = (await response.json()) as {
            type: string;
            error: { type: string; message: string };
        };
        expect(body.type).toBe("error");
        expect(body.error.type).toBe("api_error");
        expect(body.error.message).toMatch(/usage/i);
    });
});

describe("error envelope", () => {
    function failingApp(path: string, error: () => never): Hono<Env> {
        const app = new Hono<Env>();
        app.onError(handleErrorForRoute);
        app.post(path, error);
        return app;
    }

    it("reshapes auth, rate limit, and validation errors for /v1/messages only", async () => {
        const authApp = failingApp("/v1/messages", () => {
            throw new HTTPException(401, {
                message: "Missing or invalid API key",
            });
        });
        const auth = await authApp.request("/v1/messages", { method: "POST" });
        expect(auth.status).toBe(401);
        expect(await auth.json()).toEqual({
            type: "error",
            error: {
                type: "authentication_error",
                message: "Missing or invalid API key",
            },
        });

        const limitApp = new Hono<Env>();
        limitApp.onError(handleErrorForRoute);
        limitApp.post("/v1/messages", (c) => {
            c.header("Retry-After", "1.4");
            throw new HTTPException(429, { message: "Too many requests" });
        });
        const limit = await limitApp.request("/v1/messages", {
            method: "POST",
        });
        expect(limit.status).toBe(429);
        expect(limit.headers.get("retry-after")).toBe("2");
        expect(await limit.json()).toEqual({
            type: "error",
            error: { type: "rate_limit_error", message: "Too many requests" },
        });

        const chatApp = failingApp("/v1/chat/completions", () => {
            throw new HTTPException(401, {
                message: "Missing or invalid API key",
            });
        });
        const chat = await chatApp.request("/v1/chat/completions", {
            method: "POST",
        });
        expect(chat.status).toBe(401);
        const chatBody = (await chat.json()) as {
            error?: { message: string };
            success: boolean;
        };
        expect(chatBody.success).toBe(false);
        expect(chatBody.error?.message).toContain("Missing or invalid API key");
    });
});
