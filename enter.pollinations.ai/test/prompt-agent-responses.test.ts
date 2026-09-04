import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    handlePromptAgentResponsesRequest,
    PromptAgentResponsesRequestSchema,
} from "../src/services/prompt-agent-responses.ts";

const RUNTIME = {
    config: {
        systemPrompt: "You are a test agent.",
        baseModel: "openai-fast",
        mcpServers: [],
    },
    apiKey: "ag_test",
    genBaseUrl: "https://gen.test",
};

function request(input: Record<string, unknown>) {
    return PromptAgentResponsesRequestSchema.parse({
        model: crypto.randomUUID(),
        input: "hello",
        ...input,
    });
}

function streamEvents(body: string): Record<string, unknown>[] {
    return body
        .split("\n\n")
        .map((block) =>
            block.split("\n").find((line) => line.startsWith("data: ")),
        )
        .filter(
            (line): line is string => Boolean(line) && line !== "data: [DONE]",
        )
        .map((line) => JSON.parse(line.slice(6)) as Record<string, unknown>);
}

describe("managed agent Responses runtime", () => {
    beforeEach(() => vi.unstubAllGlobals());

    it("returns a native stateless Response with required usage", async () => {
        const fetchMock = vi.fn(
            async (input: RequestInfo | URL, init?: RequestInit) => {
                const upstream = new Request(input, init);
                expect(upstream.url).toBe(
                    "https://gen.test/v1/chat/completions",
                );
                expect(upstream.headers.get("authorization")).toBe(
                    "Bearer ag_test",
                );
                const body = (await upstream.json()) as Record<string, unknown>;
                expect(body).toMatchObject({
                    model: "openai-fast",
                    max_tokens: 123,
                    temperature: 0.4,
                    reasoning_effort: "low",
                    prompt_cache_key: "stable-prefix",
                    prompt_cache_options: { mode: "explicit" },
                });
                expect(body.messages).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            role: "system",
                            content: "You are a test agent.",
                            prompt_cache_breakpoint: { mode: "explicit" },
                        }),
                        expect.objectContaining({
                            role: "system",
                            content: "Answer in one sentence.",
                        }),
                        expect.objectContaining({
                            role: "user",
                            content: "hello",
                        }),
                    ]),
                );
                return Response.json({
                    id: "chatcmpl-upstream",
                    object: "chat.completion",
                    created: 1,
                    choices: [
                        {
                            index: 0,
                            message: { role: "assistant", content: "done" },
                            finish_reason: "stop",
                        },
                    ],
                    usage: {
                        prompt_tokens: 6,
                        completion_tokens: 2,
                        total_tokens: 8,
                        prompt_tokens_details: {
                            cached_tokens: 3,
                            cache_write_tokens: 1,
                        },
                        completion_tokens_details: { reasoning_tokens: 1 },
                    },
                });
            },
        );
        vi.stubGlobal("fetch", fetchMock);

        const response = await handlePromptAgentResponsesRequest(
            request({
                instructions: "Answer in one sentence.",
                max_output_tokens: 123,
                temperature: 0.4,
                reasoning: { effort: "low" },
                prompt_cache_key: "stable-prefix",
                prompt_cache_options: { mode: "explicit" },
                metadata: { trace: "test" },
            }),
            new AbortController().signal,
            RUNTIME,
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            object: "response",
            status: "completed",
            completed_at: expect.any(Number),
            previous_response_id: null,
            instructions: "Answer in one sentence.",
            error: null,
            tools: [],
            tool_choice: "auto",
            truncation: "disabled",
            parallel_tool_calls: true,
            text: { format: { type: "text" } },
            top_p: 1,
            presence_penalty: 0,
            frequency_penalty: 0,
            top_logprobs: 0,
            temperature: 0.4,
            reasoning: { effort: "low", summary: null },
            max_output_tokens: 123,
            max_tool_calls: null,
            background: false,
            service_tier: "default",
            safety_identifier: null,
            prompt_cache_key: "stable-prefix",
            output: [
                {
                    type: "message",
                    role: "assistant",
                    content: [{ type: "output_text", text: "done" }],
                },
            ],
            usage: {
                input_tokens: 6,
                input_tokens_details: {
                    cached_tokens: 3,
                    cache_write_tokens: 1,
                },
                output_tokens: 2,
                output_tokens_details: { reasoning_tokens: 1 },
                total_tokens: 8,
            },
            metadata: { trace: "test" },
            store: false,
        });
    });

    it("preserves caller cache breakpoints through the managed agent", async () => {
        let body: Record<string, unknown> | undefined;
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
                body = (await new Request(input, init).json()) as Record<
                    string,
                    unknown
                >;
                return Response.json({
                    id: "chatcmpl-explicit-cache",
                    object: "chat.completion",
                    created: 1,
                    choices: [
                        {
                            index: 0,
                            message: { role: "assistant", content: "done" },
                            finish_reason: "stop",
                        },
                    ],
                    usage: {
                        prompt_tokens: 6,
                        completion_tokens: 2,
                        total_tokens: 8,
                    },
                });
            }),
        );

        const response = await handlePromptAgentResponsesRequest(
            request({
                input: [
                    {
                        type: "message",
                        role: "user",
                        content: [
                            {
                                type: "input_text",
                                text: "Stable context",
                                prompt_cache_breakpoint: {
                                    mode: "explicit",
                                },
                            },
                            { type: "input_text", text: "Question" },
                        ],
                    },
                ],
            }),
            new AbortController().signal,
            RUNTIME,
        );

        expect(response.status).toBe(200);
        expect(body).toMatchObject({
            prompt_cache_options: { mode: "explicit" },
            messages: [
                { role: "system", content: "You are a test agent." },
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: "Stable context",
                            prompt_cache_breakpoint: { mode: "explicit" },
                        },
                        { type: "text", text: "Question" },
                    ],
                },
            ],
        });
    });

    it("maps content filtering to an incomplete Response", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                Response.json({
                    id: "chatcmpl-filtered",
                    object: "chat.completion",
                    created: 1,
                    choices: [
                        {
                            index: 0,
                            message: {
                                role: "assistant",
                                content: "Response withheld.",
                            },
                            finish_reason: "content_filter",
                        },
                    ],
                    usage: {
                        prompt_tokens: 4,
                        completion_tokens: 1,
                        total_tokens: 5,
                    },
                }),
            ),
        );

        const response = await handlePromptAgentResponsesRequest(
            request({}),
            new AbortController().signal,
            RUNTIME,
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            status: "incomplete",
            incomplete_details: { reason: "content_filter" },
        });
    });

    it("emits canonical Responses events with one terminal sentinel", async () => {
        const chunks = [
            {
                id: "chatcmpl-upstream",
                object: "chat.completion.chunk",
                created: 1,
                model: "openai-fast",
                choices: [
                    {
                        index: 0,
                        delta: { role: "assistant", content: "hello" },
                        finish_reason: null,
                    },
                ],
            },
            {
                id: "chatcmpl-upstream",
                object: "chat.completion.chunk",
                created: 1,
                model: "openai-fast",
                choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
                usage: {
                    prompt_tokens: 4,
                    completion_tokens: 1,
                    total_tokens: 5,
                },
            },
        ];
        vi.stubGlobal(
            "fetch",
            vi.fn(
                async () =>
                    new Response(
                        `${chunks
                            .map(
                                (chunk) => `data: ${JSON.stringify(chunk)}\n\n`,
                            )
                            .join("")}data: [DONE]\n\n`,
                        { headers: { "content-type": "text/event-stream" } },
                    ),
            ),
        );

        const response = await handlePromptAgentResponsesRequest(
            request({ stream: true }),
            new AbortController().signal,
            RUNTIME,
        );
        const body = await response.text();
        const events = streamEvents(body);

        expect(body.match(/data: \[DONE\]/g)).toHaveLength(1);
        expect(body.endsWith("data: [DONE]\n\n")).toBe(true);
        expect(events.map((event) => event.type)).toEqual([
            "response.created",
            "response.output_item.added",
            "response.content_part.added",
            "response.output_text.delta",
            "response.output_text.done",
            "response.content_part.done",
            "response.output_item.done",
            "response.completed",
        ]);
        expect(events.map((event) => event.sequence_number)).toEqual(
            events.map((_, index) => index),
        );
        expect(events.at(-1)).toMatchObject({
            response: {
                status: "completed",
                usage: {
                    input_tokens: 4,
                    output_tokens: 1,
                    total_tokens: 5,
                },
            },
        });
    });

    it.each([
        false,
        true,
    ])("fails closed when stream:%s omits usage", async (stream) => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                if (!stream) {
                    return Response.json({
                        id: "chatcmpl-upstream",
                        object: "chat.completion",
                        created: 1,
                        choices: [
                            {
                                index: 0,
                                message: {
                                    role: "assistant",
                                    content: "untrusted",
                                },
                                finish_reason: "stop",
                            },
                        ],
                    });
                }
                return new Response(
                    'data: {"choices":[{"index":0,"delta":{"content":"untrusted"},"finish_reason":null}]}\n\n' +
                        'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n' +
                        "data: [DONE]\n\n",
                    { headers: { "content-type": "text/event-stream" } },
                );
            }),
        );

        const response = await handlePromptAgentResponsesRequest(
            request({ stream }),
            new AbortController().signal,
            RUNTIME,
        );
        if (!stream) {
            expect(response.status).toBe(502);
            await expect(response.json()).resolves.toMatchObject({
                error: { code: "agent_error" },
            });
            return;
        }
        const events = streamEvents(await response.text());
        expect(events.at(-2)).toMatchObject({
            type: "error",
            error: { code: "agent_error" },
        });
        expect(events.at(-1)).toMatchObject({
            type: "response.failed",
            response: { status: "failed", usage: null },
        });
        expect(
            events.some((event) => event.type === "response.completed"),
        ).toBe(false);
    });

    it.each([
        false,
        true,
    ])("fails closed when stream:%s returns malformed usage", async (stream) => {
        const usage = {
            prompt_tokens: "four",
            completion_tokens: 1,
            total_tokens: 5,
        };
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                if (!stream) {
                    return Response.json({
                        id: "chatcmpl-upstream",
                        object: "chat.completion",
                        created: 1,
                        choices: [
                            {
                                index: 0,
                                message: {
                                    role: "assistant",
                                    content: "untrusted",
                                },
                                finish_reason: "stop",
                            },
                        ],
                        usage,
                    });
                }
                return new Response(
                    'data: {"choices":[{"index":0,"delta":{"content":"untrusted"},"finish_reason":null}]}\n\n' +
                        `data: ${JSON.stringify({
                            choices: [
                                {
                                    index: 0,
                                    delta: {},
                                    finish_reason: "stop",
                                },
                            ],
                            usage,
                        })}\n\n` +
                        "data: [DONE]\n\n",
                    { headers: { "content-type": "text/event-stream" } },
                );
            }),
        );

        const response = await handlePromptAgentResponsesRequest(
            request({ stream }),
            new AbortController().signal,
            RUNTIME,
        );
        if (!stream) {
            expect(response.status).toBe(502);
            await expect(response.json()).resolves.toMatchObject({
                error: { code: "agent_error" },
            });
            return;
        }
        const events = streamEvents(await response.text());
        expect(events.at(-2)).toMatchObject({
            type: "error",
            error: { code: "agent_error" },
        });
        expect(events.at(-1)).toMatchObject({
            type: "response.failed",
            response: { status: "failed", usage: null },
        });
        expect(
            events.some((event) => event.type === "response.completed"),
        ).toBe(false);
    });

    it("rejects state and unsupported parameters", async () => {
        expect(
            PromptAgentResponsesRequestSchema.safeParse({
                model: crypto.randomUUID(),
                input: "hello",
                store: true,
            }).success,
        ).toBe(false);

        // Caller tools are ignored, not rejected: Open WebUI attaches builtin
        // tool specs to every chat sent from its UI, which used to 400 every
        // managed-agent call.
        const withTools = await handlePromptAgentResponsesRequest(
            request({
                tools: [{ type: "function", name: "external", parameters: {} }],
            }),
            new AbortController().signal,
            RUNTIME,
        );
        expect(withTools.status).not.toBe(400);

        for (const [field, value] of [
            ["max_tool_calls", { max_tool_calls: 2 }],
            ["reasoning", { reasoning: { effort: "low", summary: "auto" } }],
        ] as const) {
            const unsupported = await handlePromptAgentResponsesRequest(
                request(value),
                new AbortController().signal,
                RUNTIME,
            );
            expect(unsupported.status).toBe(400);
            await expect(unsupported.json()).resolves.toMatchObject({
                error: { code: "unsupported_parameter", param: field },
            });
        }
    });
});
