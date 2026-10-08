import { env } from "cloudflare:test";
import { validator } from "@shared/middleware/validator.ts";
import { TEXT_SERVICES } from "@shared/registry/text.ts";
import {
    type CreateResponseRequest,
    CreateResponseRequestSchema,
} from "@shared/schemas/openai.ts";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env.ts";
import {
    chatCompletionToResponse,
    responsesToChatRequest,
} from "@/text/responses/chatAdaptedRequest.ts";
import { chatStreamToResponsesStream } from "@/text/responses/chatAdaptedStream.ts";
import { generateCreateResponse } from "@/text/responses/handler.ts";
import { ResponsesInvalidRequestError } from "@/text/responses/request.ts";
import type { ChatCompletion } from "@/text/types.ts";

const encoder = new TextEncoder();

function sseEvents(text: string): { event: string; data: string }[] {
    return text
        .split("\n\n")
        .map((block) => block.trim())
        .filter(Boolean)
        .map((block) => {
            const event = block
                .split("\n")
                .find((line) => line.startsWith("event:"))
                ?.slice("event:".length)
                .trim();
            const data = block
                .split("\n")
                .find((line) => line.startsWith("data:"))
                ?.slice("data:".length)
                .trim();
            return { event: event ?? "", data: data ?? "" };
        });
}

describe("responsesToChatRequest", () => {
    it("translates string input, instructions and sampling fields", () => {
        const chat = responsesToChatRequest(
            {
                model: "ignored",
                input: "Hello",
                instructions: "Be terse",
                max_output_tokens: 128,
                temperature: 0.4,
                reasoning: { effort: "low" },
            } as unknown as CreateResponseRequest,
            "some/model",
        );
        expect(chat).toMatchObject({
            model: "some/model",
            messages: [
                { role: "system", content: "Be terse" },
                { role: "user", content: "Hello" },
            ],
            max_completion_tokens: 128,
            temperature: 0.4,
            reasoning_effort: "low",
        });
    });

    it("merges function calls and outputs into chat tool messages", () => {
        const chat = responsesToChatRequest(
            {
                model: "ignored",
                input: [
                    { role: "user", content: "Weather?" },
                    {
                        type: "function_call",
                        call_id: "call_1",
                        name: "weather",
                        arguments: "{}",
                    },
                    {
                        type: "function_call_output",
                        call_id: "call_1",
                        output: "sunny",
                    },
                ],
                tools: [
                    {
                        type: "function",
                        name: "weather",
                        parameters: { type: "object" },
                    },
                ],
                tool_choice: { type: "function", name: "weather" },
            } as unknown as CreateResponseRequest,
            "some/model",
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
                        function: { name: "weather", arguments: "{}" },
                    },
                ],
            },
            { role: "tool", tool_call_id: "call_1", content: "sunny" },
        ]);
        expect(chat.tool_choice).toEqual({
            type: "function",
            function: { name: "weather" },
        });
    });

    it("rejects parameters with no chat equivalent", () => {
        expect(() =>
            responsesToChatRequest(
                {
                    model: "m",
                    input: "hi",
                    max_tool_calls: 2,
                } as unknown as CreateResponseRequest,
                "some/model",
            ),
        ).toThrow(ResponsesInvalidRequestError);
        expect(() =>
            responsesToChatRequest(
                {
                    model: "m",
                    input: "hi",
                    top_logprobs: 3,
                } as unknown as CreateResponseRequest,
                "some/model",
            ),
        ).toThrow(ResponsesInvalidRequestError);
    });

    it("rejects item_reference with a parameter-specific 400", () => {
        expect(() =>
            responsesToChatRequest(
                {
                    model: "m",
                    input: [{ type: "item_reference", id: "msg_1" }],
                } as unknown as CreateResponseRequest,
                "some/model",
            ),
        ).toThrow(ResponsesInvalidRequestError);
    });
});

describe("chatCompletionToResponse", () => {
    const base: ChatCompletion = {
        id: "chatcmpl-1",
        created: 1700000000,
        choices: [
            {
                finish_reason: "stop",
                message: { role: "assistant", content: "Hi there" },
            },
        ],
        usage: {
            prompt_tokens: 5,
            completion_tokens: 3,
            total_tokens: 8,
            prompt_tokens_details: { cached_tokens: 2 },
            completion_tokens_details: { reasoning_tokens: 1 },
        },
    };

    it("builds a completed envelope with converted usage", () => {
        const response = chatCompletionToResponse(base, "some/model");
        expect(response).toMatchObject({
            id: "chatcmpl-1",
            object: "response",
            model: "some/model",
            status: "completed",
            usage: {
                input_tokens: 5,
                input_tokens_details: { cached_tokens: 2 },
                output_tokens: 3,
                output_tokens_details: { reasoning_tokens: 1 },
                total_tokens: 8,
            },
        });
        const message = response.output.find((item) => item.type === "message");
        expect(message).toMatchObject({
            role: "assistant",
            content: [{ type: "output_text", text: "Hi there" }],
        });
    });

    it("maps length and content_filter to incomplete, never failed", () => {
        for (const [finish, reason] of [
            ["length", "max_output_tokens"],
            ["content_filter", "content_filter"],
        ] as const) {
            const completion: ChatCompletion = {
                ...base,
                choices: [{ ...base.choices![0], finish_reason: finish }],
            };
            const response = chatCompletionToResponse(completion, "m");
            expect(response.status).toBe("incomplete");
            expect(response.incomplete_details).toEqual({ reason });
        }
    });

    it("omits the message item for tool-only completions", () => {
        const completion: ChatCompletion = {
            ...base,
            choices: [
                {
                    finish_reason: "tool_calls",
                    message: {
                        role: "assistant",
                        content: null,
                        tool_calls: [
                            {
                                id: "call_9",
                                type: "function",
                                function: { name: "f", arguments: "{}" },
                            },
                        ],
                    } as never,
                },
            ],
        };
        const response = chatCompletionToResponse(completion, "m");
        expect(response.status).toBe("completed");
        expect(response.output.map((item) => item.type)).toEqual([
            "function_call",
        ]);
        expect(response.output[0]).toMatchObject({
            call_id: "call_9",
            name: "f",
        });
    });
});

describe("chatStreamToResponsesStream", () => {
    async function convert(frames: (string | Uint8Array)[]): Promise<string> {
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                for (const frame of frames) {
                    controller.enqueue(
                        typeof frame === "string"
                            ? encoder.encode(frame)
                            : frame,
                    );
                }
                controller.close();
            },
        });
        const reader = chatStreamToResponsesStream(
            body,
            "some/model",
        ).getReader();
        const chunks: Uint8Array[] = [];
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
        }
        const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
        let offset = 0;
        for (const chunk of chunks) {
            out.set(chunk, offset);
            offset += chunk.length;
        }
        return new TextDecoder().decode(out);
    }

    const chunk = (delta: object, extra: object = {}) =>
        `data: ${JSON.stringify({
            id: "chatcmpl-s",
            created: 1700000000,
            choices: [{ index: 0, delta, finish_reason: null }],
            ...extra,
        })}\n\n`;

    it("emits the full Responses event sequence with usage and [DONE]", async () => {
        const text = await convert([
            chunk({ role: "assistant", content: "" }),
            chunk({ content: "Hel" }),
            // Split an SSE frame across two reads to prove parser continuity.
            "data: ",
            `${JSON.stringify({
                choices: [
                    {
                        index: 0,
                        delta: { content: "lo" },
                        finish_reason: "stop",
                    },
                ],
            })}\n\ndata: ${JSON.stringify({
                choices: [],
                usage: {
                    prompt_tokens: 4,
                    completion_tokens: 2,
                    total_tokens: 6,
                },
            })}\n\ndata: [DONE]\n\n`,
        ]);
        const events = sseEvents(text);
        const types = events.map((e) => e.event).filter(Boolean);
        expect(types).toEqual([
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
        expect(events.at(-1)?.data).toBe("[DONE]");
        const completed = events.find((e) => e.event === "response.completed");
        const response = JSON.parse(completed!.data).response;
        expect(response.status).toBe("completed");
        expect(response.usage).toMatchObject({
            input_tokens: 4,
            output_tokens: 2,
            total_tokens: 6,
        });
        const message = response.output.find(
            (item: { type: string }) => item.type === "message",
        );
        expect(message.content[0].text).toBe("Hello");
        // sequence_number strictly increases from 0.
        events.slice(0, -1).forEach((e, index) => {
            expect(JSON.parse(e.data).sequence_number).toBe(index);
        });
    });

    it("streams tool calls without an empty message item", async () => {
        const text = await convert([
            chunk({
                tool_calls: [
                    {
                        index: 0,
                        id: "call_1",
                        function: { name: "weather", arguments: "" },
                    },
                ],
            }),
            chunk({
                tool_calls: [{ index: 0, function: { arguments: '{"city":' } }],
            }),
            `data: ${JSON.stringify({
                choices: [
                    {
                        index: 0,
                        delta: {
                            tool_calls: [
                                {
                                    index: 0,
                                    function: { arguments: '"Paris"}' },
                                },
                            ],
                        },
                        finish_reason: "tool_calls",
                    },
                ],
            })}\n\ndata: ${JSON.stringify({
                choices: [],
                usage: {
                    prompt_tokens: 3,
                    completion_tokens: 5,
                    total_tokens: 8,
                },
            })}\n\ndata: [DONE]\n\n`,
        ]);
        const events = sseEvents(text);
        const types = events.map((e) => e.event);
        expect(types).not.toContain("response.output_text.delta");
        expect(types).toContain("response.function_call_arguments.delta");
        const completed = events.find((e) => e.event === "response.completed");
        const response = JSON.parse(completed!.data).response;
        expect(response.output).toHaveLength(1);
        expect(response.output[0]).toMatchObject({
            type: "function_call",
            call_id: "call_1",
            name: "weather",
            arguments: '{"city":"Paris"}',
        });
    });

    it("keeps reasoning and streamed item ids in the terminal envelope", async () => {
        const text = await convert([
            chunk({ reasoning_content: "thinking " }),
            chunk({ reasoning_content: "hard" }),
            chunk({ content: "Answer" }),
            `data: ${JSON.stringify({
                choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
            })}\n\ndata: ${JSON.stringify({
                choices: [],
                usage: {
                    prompt_tokens: 3,
                    completion_tokens: 4,
                    total_tokens: 7,
                },
            })}\n\ndata: [DONE]\n\n`,
        ]);
        const events = sseEvents(text);
        const completed = events.find((e) => e.event === "response.completed");
        const response = JSON.parse(completed!.data).response;
        // Reasoning survived the switch to text and kept its streamed id.
        const reasoningAdded = events.find(
            (e) =>
                e.event === "response.output_item.added" &&
                JSON.parse(e.data).item.type === "reasoning",
        );
        const reasoningId = JSON.parse(reasoningAdded!.data).item.id;
        expect(response.output[0]).toMatchObject({
            id: reasoningId,
            type: "reasoning",
            summary: [{ type: "summary_text", text: "thinking hard" }],
        });
        expect(response.output[1]).toMatchObject({
            type: "message",
            content: [{ type: "output_text", text: "Answer" }],
        });
        // output_index in events matches the terminal output order.
        const messageAdded = events.find(
            (e) =>
                e.event === "response.output_item.added" &&
                JSON.parse(e.data).item.type === "message",
        );
        expect(JSON.parse(messageAdded!.data).output_index).toBe(1);
    });

    it("keeps terminal output order for text arriving after tool calls", async () => {
        const text = await convert([
            chunk({
                tool_calls: [
                    {
                        index: 0,
                        id: "call_1",
                        function: { name: "f", arguments: "{}" },
                    },
                ],
            }),
            `data: ${JSON.stringify({
                choices: [
                    {
                        index: 0,
                        delta: { content: "late text" },
                        finish_reason: "stop",
                    },
                ],
            })}\n\ndata: ${JSON.stringify({
                choices: [],
                usage: {
                    prompt_tokens: 1,
                    completion_tokens: 2,
                    total_tokens: 3,
                },
            })}\n\ndata: [DONE]\n\n`,
        ]);
        const events = sseEvents(text);
        const completed = events.find((e) => e.event === "response.completed");
        const response = JSON.parse(completed!.data).response;
        // Streamed order: function_call at output_index 0, message at 1.
        expect(
            response.output.map((item: { type: string }) => item.type),
        ).toEqual(["function_call", "message"]);
        const added = events
            .filter((e) => e.event === "response.output_item.added")
            .map((e) => JSON.parse(e.data));
        expect(added[0].output_index).toBe(0);
        expect(added[1].output_index).toBe(1);
    });

    it("emits usage_missing instead of completed when [DONE] lacks usage", async () => {
        const text = await convert([
            chunk({ content: "Hi" }),
            "data: [DONE]\n\n",
        ]);
        const events = sseEvents(text);
        const types = events.map((e) => e.event);
        expect(types).not.toContain("response.completed");
        const errorEvent = events.find((e) => e.event === "error");
        expect(errorEvent).toBeDefined();
        expect(JSON.parse(errorEvent!.data)).toMatchObject({
            code: "usage_missing",
        });
    });

    it("ends with an error event when the chat stream omits usage", async () => {
        const text = await convert([chunk({ content: "Hi" })]);
        const events = sseEvents(text);
        expect(events.at(-1)?.event).toBe("error");
        expect(JSON.parse(events.at(-1)!.data)).toMatchObject({
            code: "usage_missing",
        });
    });
});

describe("adapted /v1/responses handler", () => {
    const fetchMock = vi.fn();
    beforeEach(() => {
        fetchMock.mockReset();
        vi.stubGlobal("fetch", fetchMock);
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function app(track?: {
        overrideResponseTracking: ReturnType<typeof vi.fn>;
    }) {
        const app = new Hono<Env>();
        app.use("*", async (c, next) => {
            c.set("model", {
                requested: "qwen-coder",
                resolved: "qwen/qwen3-coder-30b-a3b-instruct",
                definition: TEXT_SERVICES["qwen/qwen3-coder-30b-a3b-instruct"],
            });
            if (track) c.set("track", track as never);
            await next();
        });
        app.post(
            "/v1/responses",
            validator("json", CreateResponseRequestSchema),
            generateCreateResponse,
        );
        return app;
    }

    it("serves a chat-only model as a Responses envelope, non-streamed", async () => {
        fetchMock.mockImplementation(async () =>
            Response.json({
                id: "chatcmpl-adapted",
                created: 1700000000,
                choices: [
                    {
                        finish_reason: "stop",
                        message: {
                            role: "assistant",
                            content: "Adapted hello",
                        },
                    },
                ],
                usage: {
                    prompt_tokens: 9,
                    completion_tokens: 4,
                    total_tokens: 13,
                },
            }),
        );
        const track = { overrideResponseTracking: vi.fn() };
        const response = await app(track).request(
            "/v1/responses",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "qwen-coder",
                    input: "Hello",
                    instructions: "Be terse",
                    max_output_tokens: 64,
                    safe: false,
                }),
            },
            env,
        );
        expect(response.status).toBe(200);
        const body = (await response.json()) as Record<string, any>;
        expect(body).toMatchObject({
            object: "response",
            model: "qwen/qwen3-coder-30b-a3b-instruct",
            status: "completed",
            usage: { input_tokens: 9, output_tokens: 4, total_tokens: 13 },
        });
        expect(body.output[0]).toMatchObject({
            type: "message",
            content: [{ type: "output_text", text: "Adapted hello" }],
        });
        // The upstream saw a translated Chat Completions request.
        const upstreamBody = JSON.parse(
            String(fetchMock.mock.calls[0][1]?.body),
        );
        expect(upstreamBody.messages).toEqual([
            { role: "system", content: "Be terse" },
            { role: "user", content: "Hello" },
        ]);
        // Providers differ on the token limit field; the pipeline maps it.
        expect(
            upstreamBody.max_completion_tokens ?? upstreamBody.max_tokens,
        ).toBe(64);
        // Billing tracked exactly one response.
        expect(track.overrideResponseTracking).toHaveBeenCalledTimes(1);
    });

    it("serves a chat-only model as Responses SSE when streamed", async () => {
        const frame = (data: string) => encoder.encode(`data: ${data}\n\n`);
        const chatStream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(
                    frame(
                        JSON.stringify({
                            choices: [
                                {
                                    index: 0,
                                    delta: { content: "Streamed" },
                                    finish_reason: null,
                                },
                            ],
                        }),
                    ),
                );
                controller.enqueue(
                    frame(
                        JSON.stringify({
                            choices: [
                                {
                                    index: 0,
                                    delta: { content: " hello" },
                                    finish_reason: "stop",
                                },
                            ],
                        }),
                    ),
                );
                controller.enqueue(
                    frame(
                        JSON.stringify({
                            choices: [],
                            usage: {
                                prompt_tokens: 2,
                                completion_tokens: 3,
                                total_tokens: 5,
                            },
                        }),
                    ),
                );
                controller.enqueue(frame("[DONE]"));
                controller.close();
            },
        });
        fetchMock.mockImplementation(
            async () =>
                new Response(chatStream, {
                    headers: { "Content-Type": "text/event-stream" },
                }),
        );
        const track = { overrideResponseTracking: vi.fn() };
        const response = await app(track).request(
            "/v1/responses",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "qwen-coder",
                    input: "Hello",
                    stream: true,
                    safe: false,
                }),
            },
            env,
        );
        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toContain(
            "text/event-stream",
        );
        const events = sseEvents(await response.text());
        const types = events.map((e) => e.event);
        expect(types).toContain("response.output_text.delta");
        expect(types).toContain("response.completed");
        expect(events.at(-1)?.data).toBe("[DONE]");
        const completed = events.find((e) => e.event === "response.completed");
        const assembled = JSON.parse(completed!.data).response;
        expect(assembled.usage).toMatchObject({
            input_tokens: 2,
            output_tokens: 3,
            total_tokens: 5,
        });
        expect(assembled.output[0].content[0].text).toBe("Streamed hello");
        expect(track.overrideResponseTracking).toHaveBeenCalledTimes(1);
    });

    it("still rejects untranslatable requests with the 400 envelope", async () => {
        const response = await app().request(
            "/v1/responses",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "qwen-coder",
                    input: "Hello",
                    max_tool_calls: 2,
                    safe: false,
                }),
            },
            env,
        );
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({
            error: { type: "invalid_request_error" },
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
