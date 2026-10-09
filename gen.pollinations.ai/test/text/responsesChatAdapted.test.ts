import { env } from "cloudflare:test";
import { validator } from "@shared/middleware/validator.ts";
import { TEXT_SERVICES } from "@shared/registry/text.ts";
import {
    type CreateResponseRequest,
    CreateResponseRequestSchema,
    type CreateResponseResponse,
    CreateResponseResponseSchema,
} from "@shared/schemas/openai.ts";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env.ts";
import {
    chatCompletionToResponse,
    chatUsageToResponseUsage,
    responsesToChatRequest,
} from "@/text/responses/chatAdapter.ts";
import { chatStreamToResponsesEvents } from "@/text/responses/chatAdapterStream.ts";
import { generateCreateResponse } from "@/text/responses/handler.ts";
import { ResponsesInvalidRequestError } from "@/text/responses/request.ts";
import { createResponsesStreamUsageValidator } from "@/text/responses/stream.ts";
import { getResponsesEventUsage } from "@/text/responses/tracking.ts";
import type { ChatCompletion } from "@/text/types.ts";

const encoder = new TextEncoder();

// Chat-only model: the Novita config has no responsesEndpoint, and its
// key is present in the test environment.
const CHAT_ONLY_MODEL = "inclusionai/ling-3.1-flash";

afterEach(() => {
    vi.restoreAllMocks();
});

function responseRequest(
    overrides: Partial<CreateResponseRequest> = {},
): CreateResponseRequest {
    return {
        model: CHAT_ONLY_MODEL,
        input: "Hello",
        stream: false,
        store: false,
        safe: "false",
        ...overrides,
    };
}

function chatCompletion(
    overrides: Record<string, unknown> = {},
): ChatCompletion {
    return {
        id: "chatcmpl_test",
        object: "chat.completion",
        created: 123,
        model: CHAT_ONLY_MODEL,
        choices: [
            {
                index: 0,
                finish_reason: "stop",
                message: { role: "assistant", content: "Hello" },
            },
        ],
        usage: {
            prompt_tokens: 2,
            completion_tokens: 1,
            total_tokens: 3,
            prompt_tokens_details: { cached_tokens: 1 },
            completion_tokens_details: { reasoning_tokens: 4 },
        },
        ...overrides,
    } as ChatCompletion;
}

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

async function collectSse(
    body: ReadableStream<Uint8Array>,
): Promise<{ events: string[]; payloads: Record<string, unknown>[] }> {
    const text = await new Response(body).text();
    const events: string[] = [];
    const payloads: Record<string, unknown>[] = [];
    for (const block of text.split("\n\n")) {
        const typeMatch = block.match(/^event: (.+)$/m);
        const dataMatch = block.match(/^data: (.+)$/m);
        if (!dataMatch) continue;
        events.push(typeMatch?.[1] ?? "");
        payloads.push(JSON.parse(dataMatch[1]));
    }
    return { events, payloads };
}

describe("responsesToChatRequest", () => {
    it("maps instructions, string input, and sampling controls", () => {
        const chat = responsesToChatRequest(
            responseRequest({
                instructions: "Be kind",
                temperature: 0.5,
                top_p: 0.9,
                frequency_penalty: 0.1,
                presence_penalty: 0.2,
                max_output_tokens: 100,
                reasoning: { effort: "low" },
            }),
        );
        expect(chat.messages).toEqual([
            { role: "system", content: "Be kind" },
            { role: "user", content: "Hello" },
        ]);
        expect(chat.model).toBe(CHAT_ONLY_MODEL);
        expect(chat.max_completion_tokens).toBe(100);
        expect(chat.temperature).toBe(0.5);
        expect(chat.top_p).toBe(0.9);
        expect(chat.reasoning_effort).toBe("low");
        expect(chat.stream).toBe(false);
    });

    it("maps tools, named tool choices, and structured output", () => {
        const chat = responsesToChatRequest(
            responseRequest({
                tools: [
                    {
                        type: "function",
                        name: "weather",
                        description: "Get weather",
                        parameters: { type: "object", properties: {} },
                        strict: true,
                    },
                ],
                tool_choice: { type: "function", name: "weather" },
                text: {
                    format: {
                        type: "json_schema",
                        name: "calendar",
                        schema: { type: "object" },
                        strict: true,
                    },
                },
                parallel_tool_calls: false,
            }),
        );
        expect(chat.tools).toEqual([
            {
                type: "function",
                function: {
                    name: "weather",
                    description: "Get weather",
                    parameters: { type: "object", properties: {} },
                    strict: true,
                },
            },
        ]);
        expect(chat.tool_choice).toEqual({
            type: "function",
            function: { name: "weather" },
        });
        expect(chat.response_format).toEqual({
            type: "json_schema",
            json_schema: {
                name: "calendar",
                schema: { type: "object" },
                strict: true,
            },
        });
        expect(chat.parallel_tool_calls).toBe(false);
    });

    it("maps user image input to image_url parts", () => {
        const chat = responsesToChatRequest(
            responseRequest({
                input: [
                    {
                        role: "user",
                        content: [
                            { type: "input_text", text: "What is this?" },
                            {
                                type: "input_image",
                                image_url: "https://example.test/cat.png",
                                detail: "low",
                            },
                        ],
                    },
                ],
            }),
        );
        expect(chat.messages).toEqual([
            {
                role: "user",
                content: [
                    { type: "text", text: "What is this?" },
                    {
                        type: "image_url",
                        image_url: {
                            url: "https://example.test/cat.png",
                            detail: "low",
                        },
                    },
                ],
            },
        ]);
    });

    it("groups replayed function calls and maps their outputs to tool messages", () => {
        const chat = responsesToChatRequest(
            responseRequest({
                input: [
                    { role: "user", content: "Weather?" },
                    {
                        type: "function_call",
                        call_id: "call_1",
                        name: "weather",
                        arguments: '{"city":"SF"}',
                    },
                    {
                        type: "function_call",
                        call_id: "call_2",
                        name: "time",
                        arguments: "{}",
                    },
                    {
                        type: "function_call_output",
                        call_id: "call_1",
                        output: "Sunny",
                    },
                ],
            }),
        );
        expect(chat.messages).toEqual([
            { role: "user", content: "Weather?" },
            {
                role: "assistant",
                content: null,
                tool_calls: [
                    {
                        id: "call_1",
                        type: "function",
                        function: {
                            name: "weather",
                            arguments: '{"city":"SF"}',
                        },
                    },
                    {
                        id: "call_2",
                        type: "function",
                        function: { name: "time", arguments: "{}" },
                    },
                ],
            },
            { role: "tool", tool_call_id: "call_1", content: "Sunny" },
        ]);
    });

    it("maps replayed assistant messages and drops replayed reasoning", () => {
        const chat = responsesToChatRequest(
            responseRequest({
                input: [
                    { role: "user", content: "Hi" },
                    {
                        type: "reasoning",
                        content: [{ type: "reasoning_text", text: "hmm" }],
                    },
                    {
                        role: "assistant",
                        content: [{ type: "output_text", text: "Hello!" }],
                    },
                ],
            }),
        );
        expect(chat.messages).toEqual([
            { role: "user", content: "Hi" },
            { role: "assistant", content: "Hello!" },
        ]);
    });

    it("rejects parameters the Chat adapter cannot honor", () => {
        const cases: Partial<CreateResponseRequest>[] = [
            { max_tool_calls: 1 },
            { truncation: "auto" },
            { include: ["message.output_text.logprobs"] },
            { top_logprobs: 3 },
            { stream_options: { include_obfuscation: true } },
        ];
        for (const overrides of cases) {
            let thrown: unknown;
            try {
                responsesToChatRequest(responseRequest(overrides));
            } catch (error) {
                thrown = error;
            }
            expect(thrown).toBeInstanceOf(ResponsesInvalidRequestError);
            expect(
                (thrown as ResponsesInvalidRequestError).details.error,
            ).toMatchObject({
                type: "invalid_request_error",
                code: "unsupported_parameter",
            });
        }
    });

    it("rejects unknown input items and content parts", () => {
        expect(() =>
            responsesToChatRequest(
                responseRequest({ input: [{ role: "robot" }] }),
            ),
        ).toThrow(ResponsesInvalidRequestError);
        expect(() =>
            responsesToChatRequest(
                responseRequest({
                    input: [
                        {
                            role: "user",
                            content: [{ type: "video_url", video_url: "x" }],
                        },
                    ],
                }),
            ),
        ).toThrow(ResponsesInvalidRequestError);
    });
});

describe("chatCompletionToResponse", () => {
    it("translates content, usage, and configuration echo", () => {
        const response = chatCompletionToResponse(
            chatCompletion(),
            responseRequest({ instructions: "Be kind" }),
            CHAT_ONLY_MODEL,
        );
        expect(() =>
            CreateResponseResponseSchema.parse(response),
        ).not.toThrow();
        expect(response.status).toBe("completed");
        expect(response.output).toEqual([
            {
                type: "message",
                role: "assistant",
                status: "completed",
                content: [{ type: "output_text", text: "Hello" }],
            },
        ]);
        expect(response.usage).toMatchObject({
            input_tokens: 2,
            output_tokens: 1,
            total_tokens: 3,
            input_tokens_details: { cached_tokens: 1 },
            output_tokens_details: { reasoning_tokens: 4 },
        });
        expect(response.instructions).toBe("Be kind");
        expect(response.store).toBe(false);
        expect(response.truncation).toBe("disabled");
    });

    it("maps finish_reason length to an incomplete response", () => {
        const response = chatCompletionToResponse(
            chatCompletion({
                choices: [
                    {
                        index: 0,
                        finish_reason: "length",
                        message: { role: "assistant", content: "partial" },
                    },
                ],
            }),
            responseRequest(),
            CHAT_ONLY_MODEL,
        );
        expect(response.status).toBe("incomplete");
        expect(response.incomplete_details).toEqual({
            reason: "max_output_tokens",
        });
    });

    it("maps tool calls and reasoning to Responses output items", () => {
        const response = chatCompletionToResponse(
            chatCompletion({
                choices: [
                    {
                        index: 0,
                        finish_reason: "tool_calls",
                        message: {
                            role: "assistant",
                            content: null,
                            reasoning_content: "thinking",
                            tool_calls: [
                                {
                                    id: "call_1",
                                    type: "function",
                                    function: {
                                        name: "weather",
                                        arguments: '{"city":"SF"}',
                                    },
                                },
                            ],
                        },
                    },
                ],
            }),
            responseRequest(),
            CHAT_ONLY_MODEL,
        );
        expect(response.status).toBe("completed");
        expect(response.output).toEqual([
            {
                type: "reasoning",
                content: [{ type: "reasoning_text", text: "thinking" }],
            },
            {
                type: "function_call",
                id: "call_1",
                call_id: "call_1",
                name: "weather",
                arguments: '{"city":"SF"}',
                status: "completed",
            },
        ]);
    });

    it("returns null usage when the provider omits token counts", () => {
        expect(chatUsageToResponseUsage({ total_tokens: 1 })).toBeNull();
    });
});

describe("chatStreamToResponsesEvents", () => {
    function streamedCompletion(chunks: (object | string)[]): ChatCompletion {
        return {
            ...chatCompletion(),
            stream: true,
            responseStream: sse(chunks),
        } as ChatCompletion;
    }

    it("emits the Responses event sequence with sequential sequence numbers", async () => {
        const stream = chatStreamToResponsesEvents(
            streamedCompletion([
                { choices: [{ delta: { content: "Hel" } }] },
                { choices: [{ delta: { content: "lo" } }] },
                { choices: [{ delta: {}, finish_reason: "stop" }] },
                {
                    choices: [],
                    usage: {
                        prompt_tokens: 2,
                        completion_tokens: 2,
                        total_tokens: 4,
                    },
                },
                "[DONE]",
            ]),
            responseRequest(),
            CHAT_ONLY_MODEL,
        );
        const { events, payloads } = await collectSse(stream);

        expect(events).toEqual([
            "response.created",
            "response.in_progress",
            "response.output_item.added",
            "response.content_part.added",
            "response.output_text.delta",
            "response.output_text.delta",
            "response.output_text.done",
            "response.content_part.done",
            "response.output_item.done",
            "response.completed",
        ]);
        const sequences = payloads.map((payload) => payload.sequence_number);
        expect(sequences).toEqual(sequences.map((_, i) => i));

        const terminal = payloads.at(-1) as {
            type: string;
            response: CreateResponseResponse;
        };
        expect(terminal.type).toBe("response.completed");
        expect(terminal.response.status).toBe("completed");
        expect(terminal.response.usage).toMatchObject({
            input_tokens: 2,
            output_tokens: 2,
            total_tokens: 4,
        });
        expect(terminal.response.output).toEqual([
            {
                id: "msg_0",
                type: "message",
                role: "assistant",
                status: "completed",
                content: [{ type: "output_text", text: "Hello" }],
            },
        ]);
    });

    it("streams tool call arguments and closes each call", async () => {
        const stream = chatStreamToResponsesEvents(
            streamedCompletion([
                {
                    choices: [
                        {
                            delta: {
                                tool_calls: [
                                    {
                                        index: 0,
                                        id: "call_1",
                                        function: {
                                            name: "weather",
                                            arguments: '{"ci',
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
                                        function: { arguments: 'ty":"SF"}' },
                                    },
                                ],
                            },
                        },
                    ],
                },
                { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
                "[DONE]",
            ]),
            responseRequest(),
            CHAT_ONLY_MODEL,
        );
        const { events, payloads } = await collectSse(stream);

        expect(events).toContain("response.function_call_arguments.delta");
        expect(events).toContain("response.function_call_arguments.done");
        const terminal = payloads.at(-1) as {
            response: { output: Record<string, unknown>[] };
        };
        expect(terminal.response.output).toEqual([
            {
                id: "fc_0",
                type: "function_call",
                status: "completed",
                call_id: "call_1",
                name: "weather",
                arguments: '{"city":"SF"}',
            },
        ]);
    });

    it("emits response.incomplete when the Chat stream ends on length", async () => {
        const stream = chatStreamToResponsesEvents(
            streamedCompletion([
                { choices: [{ delta: { content: "par" } }] },
                { choices: [{ delta: {}, finish_reason: "length" }] },
                {
                    choices: [],
                    usage: {
                        prompt_tokens: 1,
                        completion_tokens: 1,
                        total_tokens: 2,
                    },
                },
                "[DONE]",
            ]),
            responseRequest({ max_output_tokens: 3 }),
            CHAT_ONLY_MODEL,
        );
        const { payloads } = await collectSse(stream);
        const terminal = payloads.at(-1) as {
            type: string;
            response: { status: string; incomplete_details: unknown };
        };
        expect(terminal.type).toBe("response.incomplete");
        expect(terminal.response.incomplete_details).toEqual({
            reason: "max_output_tokens",
        });
    });

    it("passes missing usage to the stream validator so billing fails closed", async () => {
        const stream = chatStreamToResponsesEvents(
            streamedCompletion([
                { choices: [{ delta: { content: "Hi" } }] },
                { choices: [{ delta: {}, finish_reason: "stop" }] },
                "[DONE]",
            ]),
            responseRequest(),
            CHAT_ONLY_MODEL,
        );
        const { payloads } = await collectSse(stream);
        const terminal = payloads.at(-1) as {
            response: { usage: unknown };
        };
        expect(terminal.response.usage).toBeNull();

        const validator = createResponsesStreamUsageValidator();
        const bytes = await new Response(
            chatStreamToResponsesEvents(
                streamedCompletion([
                    { choices: [{ delta: { content: "Hi" } }] },
                    { choices: [{ delta: {}, finish_reason: "stop" }] },
                    "[DONE]",
                ]),
                responseRequest(),
                CHAT_ONLY_MODEL,
            ),
        ).arrayBuffer();
        expect(() => {
            validator.feed(new Uint8Array(bytes));
            validator.finish();
        }).toThrow();
    });
});

function handlerApp() {
    const app = new Hono<Env>();
    app.use("*", async (c, next) => {
        c.set("model", {
            requested: CHAT_ONLY_MODEL,
            resolved: CHAT_ONLY_MODEL,
            definition: TEXT_SERVICES[CHAT_ONLY_MODEL],
        });
        // The Chat adapter enforces per-user model rate limits like the
        // chat routes do; supply the auth context those checks expect.
        c.set("auth", { requireUser: () => ({ id: "test-user" }) } as never);
        await next();
    });
    app.post(
        "/v1/responses",
        validator("json", CreateResponseRequestSchema),
        generateCreateResponse,
    );
    return app;
}

function mockProvider(body: { stream?: boolean }): {
    providerBodies: Record<string, unknown>[];
} {
    const providerBodies: Record<string, unknown>[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const upstream = new Request(input, init);
        const payload = (await upstream.json().catch(() => null)) as Record<
            string,
            unknown
        > | null;
        providerBodies.push(payload as Record<string, unknown>);
        if (body.stream) {
            return new Response(
                sse([
                    { choices: [{ delta: { content: "Hello" } }] },
                    { choices: [{ delta: {}, finish_reason: "stop" }] },
                    {
                        choices: [],
                        usage: {
                            prompt_tokens: 2,
                            completion_tokens: 1,
                            total_tokens: 3,
                        },
                    },
                    "[DONE]",
                ]),
                { headers: { "content-type": "text/event-stream" } },
            );
        }
        return Response.json(chatCompletion());
    });
    return { providerBodies };
}

describe("POST /v1/responses on a Chat-only model", () => {
    it("serves a non-streaming request through the Chat pipeline", async () => {
        const { providerBodies } = mockProvider({ stream: false });
        const response = await handlerApp().request(
            "/v1/responses",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: CHAT_ONLY_MODEL,
                    input: "Hello",
                    safe: false,
                    instructions: "Be kind",
                }),
            },
            env,
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("x-model-used")).toBe(CHAT_ONLY_MODEL);

        const body = (await response.json()) as CreateResponseResponse;
        expect(() => CreateResponseResponseSchema.parse(body)).not.toThrow();
        expect(body.status).toBe("completed");
        expect(body.output).toEqual([
            {
                type: "message",
                role: "assistant",
                status: "completed",
                content: [{ type: "output_text", text: "Hello" }],
            },
        ]);
        expect(body.usage).toMatchObject({
            input_tokens: 2,
            output_tokens: 1,
            total_tokens: 3,
        });

        // The provider saw a Chat Completions request.
        expect(providerBodies[0]).toMatchObject({
            model: CHAT_ONLY_MODEL,
            stream: false,
        });
        const messages = (providerBodies[0] as { messages: unknown[] })
            .messages;
        expect(messages).toEqual([
            { role: "system", content: "Be kind" },
            { role: "user", content: "Hello" },
        ]);
    });

    it("serves a streaming request with Responses events and terminal usage", async () => {
        mockProvider({ stream: true });
        const response = await handlerApp().request(
            "/v1/responses",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: CHAT_ONLY_MODEL,
                    input: "Hello",
                    safe: false,
                    stream: true,
                }),
            },
            env,
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain(
            "text/event-stream",
        );
        const { events, payloads } = await collectSse(
            response.body as ReadableStream<Uint8Array>,
        );
        expect(events[0]).toBe("response.created");
        expect(events.at(-1)).toBe("response.completed");

        const terminal = payloads.at(-1) as {
            type: string;
            response: Record<string, unknown>;
        };
        expect(terminal.response.usage).toMatchObject({
            input_tokens: 2,
            output_tokens: 1,
            total_tokens: 3,
        });
        expect(getResponsesEventUsage(terminal)).toMatchObject({
            usage: expect.objectContaining({
                promptTextTokens: 2,
                completionTextTokens: 1,
            }),
        });
    });
});
