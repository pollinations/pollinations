import OpenAI from "openai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { collectOutput } from "../../../src/text/agents/output.ts";
import {
    handlePromptAgentResponsesRequest,
    PromptAgentResponsesRequestSchema,
} from "../../../src/text/agents/responses.ts";

const RUNTIME = {
    config: {
        systemPrompt: "You are a test agent.",
        baseModel: "openai-fast",
        mcpServers: [],
    },
    apiKey: "ag_test",
    genBaseUrl: "https://gen.test",
    fetcher: (input: RequestInfo | URL, init?: RequestInit) =>
        globalThis.fetch(input, init),
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
                reasoning: { effort: "low", summary: null },
                instructions: "Answer in one sentence.",
                max_output_tokens: 123,
                temperature: 0.4,
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
        const sdkResponse = response.clone();
        const sdk = new OpenAI({
            apiKey: "test",
            fetch: async () => sdkResponse,
        });
        const aggregated = sdk.responses
            .stream({ model: "test-agent", input: "hello", store: false })
            .finalResponse();
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
        expect(await aggregated).toMatchObject(
            events.at(-1)?.response as object,
        );
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
            code: "agent_error",
            message: expect.any(String),
            param: null,
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
            code: "agent_error",
            message: expect.any(String),
            param: null,
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
    ])("replays completed function pairs with isError %j without executing them", async (isError) => {
        const call = {
            type: "function_call",
            id: "fc_prior",
            call_id: "prior-call",
            name: "mcp__exa__search",
            arguments: '{"query":"old question"}',
            status: "completed",
        };
        const result = {
            type: "function_call_output",
            id: "fco_prior",
            call_id: call.call_id,
            status: "completed",
            output: JSON.stringify({
                content: [
                    {
                        type: "text",
                        text: isError ? "Saved failure" : "Saved answer",
                    },
                ],
                ...(isError ? { isError } : {}),
            }),
        };
        const fetchMock = vi.fn(
            async (input: RequestInfo | URL, init?: RequestInit) => {
                const upstream = new Request(input, init);
                expect(upstream.url).toBe(
                    "https://gen.test/v1/chat/completions",
                );
                const body = (await upstream.json()) as Record<string, unknown>;
                expect(body.messages).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            role: "assistant",
                            tool_calls: [
                                {
                                    id: "prior-call",
                                    type: "function",
                                    function: {
                                        name: "mcp__exa__search",
                                        arguments: call.arguments,
                                    },
                                },
                            ],
                        }),
                        {
                            role: "tool",
                            tool_call_id: "prior-call",
                            content: JSON.stringify([
                                {
                                    type: "text",
                                    text: isError
                                        ? "Saved failure"
                                        : "Saved answer",
                                },
                            ]),
                        },
                        expect.objectContaining({
                            role: "user",
                            content: "What happened?",
                        }),
                    ]),
                );
                return Response.json({
                    choices: [
                        {
                            message: {
                                role: "assistant",
                                content: "I remember",
                            },
                            finish_reason: "stop",
                        },
                    ],
                    usage: {
                        prompt_tokens: 4,
                        completion_tokens: 2,
                        total_tokens: 6,
                    },
                });
            },
        );
        vi.stubGlobal("fetch", fetchMock);
        const response = await handlePromptAgentResponsesRequest(
            request({
                input: [
                    call,
                    result,
                    { role: "user", content: "What happened?" },
                ],
            }),
            new AbortController().signal,
            RUNTIME,
        );
        expect(response.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(await response.json()).toMatchObject({
            output: [{ type: "message", content: [{ text: "I remember" }] }],
            usage: { tool_call_counts: {} },
        });
        for (const input of [
            [call],
            [result],
            [result, call],
            [call, call, result],
            [call, result, result],
            [
                call,
                result,
                { ...call, id: "fc_new" },
                { ...result, id: "fco_new" },
            ],
            [{ ...call, status: "in_progress" }, result],
            [call, { ...result, status: "incomplete" }],
            [call, { ...result, status: "failed" }],
            [call, { ...result, id: call.id }],
            [call, { ...result, call_id: "unmatched" }],
            [call, { role: "user", content: "Too soon" }, result],
            [{ ...call, arguments: "invalid JSON" }, result],
            [{ ...call, arguments: "[]" }, result],
            [{ ...call, name: "external" }, result],
            [call, { ...result, output: "plain text" }],
            [call, { ...result, output: "{}" }],
            [{ type: "mcp_call", id: "old", status: "completed" }],
        ]) {
            const invalid = await handlePromptAgentResponsesRequest(
                request({ input }),
                new AbortController().signal,
                RUNTIME,
            );
            expect(invalid.status).toBe(400);
        }
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("preserves parallel function pairs, sanitized results and ordering in JSON, events and replay", async () => {
        const events: Record<string, unknown>[] = [];
        const collected = collectOutput((type, payload) => {
            events.push(structuredClone({ type, ...payload }));
        });
        collected.onPart({ type: "text-delta", text: "Checking both tools." });
        for (const toolCallId of ["call_search", "call_image"]) {
            collected.onPart({
                type: "tool-call",
                toolCallId,
                toolName: `mcp__pollinations__${toolCallId.slice(5)}`,
                input: { prompt: "Test" },
            });
        }
        // Parallel execution may complete in a different order than the calls.
        collected.onPart({
            type: "tool-result",
            toolCallId: "call_image",
            toolName: "mcp__pollinations__image",
            input: { prompt: "Test" },
            output: {
                content: [
                    { type: "text", text: "Generated image" },
                    {
                        type: "resource_link",
                        uri: "https://media.test/image.png",
                        name: "Image",
                        mimeType: "image/png",
                    },
                    {
                        type: "image",
                        data: "PRIVATE_BINARY",
                        mimeType: "image/png",
                    },
                ],
                _meta: { private: "PRIVATE_METADATA" },
            },
        });
        collected.onPart({
            type: "tool-error",
            toolCallId: "call_search",
            toolName: "mcp__pollinations__search",
            input: { prompt: "Test" },
            error: new Error("Search unavailable"),
        });
        collected.onPart({ type: "text-delta", text: "Here is the image." });
        const output = collected.finish("stop");
        expect(output.map((item) => item.type)).toEqual([
            "message",
            "function_call",
            "function_call",
            "function_call_output",
            "function_call_output",
            "message",
        ]);
        expect(new Set(output.map((item) => item.id)).size).toBe(output.length);
        expect(output[1]).toMatchObject({
            id: expect.stringMatching(/^fc_/),
            call_id: "call_search",
            name: "mcp__pollinations__search",
            arguments: '{"prompt":"Test"}',
            status: "completed",
        });
        expect(output[3]).toMatchObject({
            id: expect.stringMatching(/^fco_/),
            call_id: "call_image",
            status: "completed",
        });
        expect(output[4]).toMatchObject({
            call_id: "call_search",
            status: "completed",
            output: JSON.stringify({
                isError: true,
                content: [{ type: "text", text: "Search unavailable" }],
            }),
        });
        expect(JSON.stringify(output)).not.toContain("PRIVATE_");
        expect(
            events
                .filter((event) => event.type === "response.output_item.done")
                .map((event) => event.item),
        ).toEqual(output);
        expect(
            events.filter(
                (event) =>
                    event.type === "response.function_call_arguments.done",
            ),
        ).toHaveLength(2);
        expect(
            events
                .filter(
                    (event) =>
                        event.type === "response.function_call_arguments.delta",
                )
                .map((event) => event.delta),
        ).toEqual(['{"prompt":"Test"}', '{"prompt":"Test"}']);
        expect(
            events.some((event) => String(event.type).includes("mcp_call")),
        ).toBe(false);
        expect(
            events
                .filter((event) => event.type === "response.output_item.added")
                .map((event) => (event.item as Record<string, unknown>).status),
        ).toEqual(Array(6).fill("in_progress"));

        const fetchMock = vi.fn(
            async (input: RequestInfo | URL, init?: RequestInit) => {
                const upstream = new Request(input, init);
                expect(upstream.url).toBe(
                    "https://gen.test/v1/chat/completions",
                );
                const body = (await upstream.json()) as {
                    messages: Record<string, unknown>[];
                };
                const assistant = body.messages.find(
                    (message) => message.tool_calls,
                );
                expect(assistant?.tool_calls).toMatchObject([
                    {
                        id: "call_search",
                        function: { name: "mcp__pollinations__search" },
                    },
                    {
                        id: "call_image",
                        function: { name: "mcp__pollinations__image" },
                    },
                ]);
                const toolResults = body.messages.filter(
                    (message) => message.role === "tool",
                );
                expect(
                    toolResults.map((message) => message.tool_call_id),
                ).toEqual(["call_image", "call_search"]);
                expect(toolResults[0].content).toContain(
                    "https://media.test/image.png",
                );
                expect(toolResults[1].content).toContain("Search unavailable");
                return Response.json({
                    choices: [
                        {
                            message: {
                                role: "assistant",
                                content: "Remembered",
                            },
                            finish_reason: "stop",
                        },
                    ],
                    usage: {
                        prompt_tokens: 4,
                        completion_tokens: 2,
                        total_tokens: 6,
                    },
                });
            },
        );
        vi.stubGlobal("fetch", fetchMock);
        const response = await handlePromptAgentResponsesRequest(
            request({
                input: [...output, { role: "user", content: "Continue" }],
            }),
            new AbortController().signal,
            RUNTIME,
        );
        expect(response.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(await response.json()).toMatchObject({
            usage: { tool_call_counts: {} },
        });
    });

    it("rejects dangling or duplicate execution results and omits unexecuted invalid attempts", () => {
        const collected = collectOutput();
        collected.onPart({
            type: "tool-call",
            toolCallId: "invalid",
            toolName: "unknown",
            input: {},
            dynamic: true,
            invalid: true,
            error: new Error("Unknown tool"),
        });
        collected.onPart({
            type: "tool-error",
            toolCallId: "invalid",
            toolName: "unknown",
            input: {},
            error: new Error("Unknown tool"),
        });
        expect(collected.items).toEqual([]);
        const call = {
            type: "tool-call" as const,
            toolCallId: "valid",
            toolName: "mcp__exa__search",
            input: {},
        };
        collected.onPart(call);
        expect(() => collected.finish("stop")).toThrow("has no result");
        expect(() => collected.onPart(call)).toThrow("reused a tool call ID");
        const result = {
            type: "tool-result" as const,
            toolCallId: "valid",
            toolName: call.toolName,
            input: {},
            output: { content: [{ type: "text", text: "done" }] },
        };
        collected.onPart(result);
        expect(() => collected.onPart(result)).toThrow("no matching call");
        expect(collected.finish("stop")).toHaveLength(2);
    });

    it("rejects state and unsupported parameters", async () => {
        const fetchMock = vi.fn(async () =>
            Response.json(
                { error: { message: "Test upstream unavailable" } },
                { status: 502 },
            ),
        );
        vi.stubGlobal("fetch", fetchMock);
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
        expect(withTools.status).toBe(502);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        for (const [field, value] of [
            ["max_tool_calls", { max_tool_calls: 2 }],
            [
                "reasoning.summary",
                { reasoning: { effort: "low", summary: "auto" } },
            ],
            [
                "reasoning.summary",
                { reasoning: { effort: "low", summary: "concise" } },
            ],
            [
                "reasoning.summary",
                { reasoning: { effort: "low", summary: "detailed" } },
            ],
        ] as const) {
            for (const stream of [false, true]) {
                const unsupported = await handlePromptAgentResponsesRequest(
                    request({ ...value, stream }),
                    new AbortController().signal,
                    RUNTIME,
                );
                expect(unsupported.status).toBe(400);
                await expect(unsupported.json()).resolves.toMatchObject({
                    error: { code: "unsupported_parameter", param: field },
                });
            }
        }
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
