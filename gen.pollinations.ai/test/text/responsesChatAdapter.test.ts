import { afterEach, describe, expect, it, vi } from "vitest";
import { requireChatStreamUsage } from "../../src/text/chat/usage.js";
import { callChatViaResponses } from "../../src/text/responses/chatClient.js";
import { chatToResponsesRequest } from "../../src/text/responses/chatRequest.js";
import type {
    ChatCompletion,
    ChatMessage,
    TransformOptions,
} from "../../src/text/types.js";

const ENDPOINT = "https://provider.test/v1/responses";
const modelConfig = {
    authKey: "test-key",
    responsesEndpoint: ENDPOINT,
};

afterEach(() => {
    vi.restoreAllMocks();
});

function usage() {
    return {
        input_tokens: 10,
        input_tokens_details: {
            cached_tokens: 4,
            cache_write_tokens: 2,
        },
        output_tokens: 5,
        output_tokens_details: { reasoning_tokens: 3 },
        total_tokens: 15,
    };
}

function mockStream(events: string[]) {
    const encoder = new TextEncoder();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
            new ReadableStream<Uint8Array>({
                start(controller) {
                    for (const event of events) {
                        controller.enqueue(encoder.encode(event));
                    }
                    controller.close();
                },
            }),
            { headers: { "Content-Type": "text/event-stream" } },
        ),
    );
}

async function streamEvents(completion: ChatCompletion) {
    const value = await new Response(completion.responseStream).text();
    return value
        .split("\n\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => {
            const data = line.slice(6);
            try {
                return JSON.parse(data);
            } catch {
                return data;
            }
        });
}

describe("Chat Completions over Responses", () => {
    it("maps stateless messages, tools, structured output, and parameters", async () => {
        let body: Record<string, unknown> | undefined;
        vi.spyOn(globalThis, "fetch").mockImplementationOnce(
            async (input, init) => {
                expect(String(input)).toBe(ENDPOINT);
                expect(new Headers(init?.headers).get("authorization")).toBe(
                    "Bearer test-key",
                );
                body = JSON.parse(String(init?.body));
                return Response.json({
                    id: "resp_1",
                    object: "response",
                    created_at: 123,
                    model: "provider-model",
                    status: "completed",
                    output: [
                        {
                            type: "message",
                            content: [{ type: "output_text", text: "Sunny." }],
                        },
                    ],
                    usage: usage(),
                });
            },
        );

        const messages: ChatMessage[] = [
            { role: "system", content: "Be concise." },
            {
                role: "user",
                content: [
                    { type: "text", text: "Weather?" },
                    {
                        type: "image_url",
                        image_url: {
                            url: "data:image/png;base64,AA==",
                            detail: "low",
                        },
                    },
                ],
            },
            {
                role: "assistant",
                content: "Checking.",
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
            { role: "tool", tool_call_id: "call_1", content: "sunny" },
        ];
        const completion = await callChatViaResponses(messages, {
            model: "provider-model",
            modelConfig,
            reasoning_effort: "high",
            max_completion_tokens: 128,
            temperature: 0.5,
            parallel_tool_calls: false,
            user: "caller-id",
            prompt_cache_key: "weather-cache",
            prompt_cache_options: { mode: "implicit", ttl: "30m" },
            prompt_cache_retention: "24h",
            tools: [
                {
                    type: "function",
                    function: {
                        name: "weather",
                        description: "Get weather",
                        parameters: { type: "object" },
                        strict: true,
                    },
                },
            ],
            tool_choice: {
                type: "function",
                function: { name: "weather" },
            },
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: "answer",
                    description: "The answer",
                    strict: true,
                    schema: { type: "object" },
                },
            },
        });

        expect(body).toMatchObject({
            model: "provider-model",
            store: false,
            reasoning: { effort: "high", summary: "auto" },
            max_output_tokens: 128,
            temperature: 0.5,
            parallel_tool_calls: false,
            safety_identifier: "caller-id",
            prompt_cache_key: "weather-cache",
            prompt_cache_options: { mode: "implicit", ttl: "30m" },
            prompt_cache_retention: "24h",
            tools: [
                {
                    type: "function",
                    name: "weather",
                    description: "Get weather",
                    parameters: { type: "object" },
                    strict: true,
                },
            ],
            tool_choice: { type: "function", name: "weather" },
            text: {
                format: {
                    type: "json_schema",
                    name: "answer",
                    description: "The answer",
                    strict: true,
                    schema: { type: "object" },
                },
            },
            input: [
                {
                    role: "system",
                    content: [{ type: "input_text", text: "Be concise." }],
                },
                {
                    role: "user",
                    content: [
                        { type: "input_text", text: "Weather?" },
                        {
                            type: "input_image",
                            image_url: "data:image/png;base64,AA==",
                            detail: "low",
                        },
                    ],
                },
                {
                    role: "assistant",
                    content: [{ type: "output_text", text: "Checking." }],
                },
                {
                    type: "function_call",
                    call_id: "call_1",
                    name: "weather",
                    arguments: '{"city":"Paris"}',
                },
                {
                    type: "function_call_output",
                    call_id: "call_1",
                    output: "sunny",
                },
            ],
        });
        expect(completion).toMatchObject({
            id: "resp_1",
            object: "chat.completion",
            created: 123,
            model: "provider-model",
            choices: [
                {
                    index: 0,
                    message: { role: "assistant", content: "Sunny." },
                    finish_reason: "stop",
                },
            ],
            usage: {
                prompt_tokens: 10,
                prompt_tokens_details: {
                    cached_tokens: 4,
                    cache_write_tokens: 2,
                },
                completion_tokens: 5,
                completion_tokens_details: { reasoning_tokens: 3 },
                total_tokens: 15,
            },
        });
    });

    it("maps reasoning, refusal, function calls, and incomplete reasons", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            Response.json({
                id: "resp_tool",
                object: "response",
                model: "provider-model",
                status: "incomplete",
                incomplete_details: { reason: "max_output_tokens" },
                output: [
                    {
                        type: "reasoning",
                        summary: [{ text: "Checked." }],
                    },
                    {
                        type: "message",
                        content: [{ type: "refusal", refusal: "No." }],
                    },
                    {
                        type: "function_call",
                        call_id: "call_9",
                        name: "weather",
                        arguments: "{}",
                    },
                ],
                usage: usage(),
            }),
        );

        const completion = await callChatViaResponses(
            [{ role: "user", content: "Weather?" }],
            { model: "provider-model", modelConfig },
        );
        expect(completion.choices?.[0]).toMatchObject({
            finish_reason: "length",
            message: {
                content: null,
                refusal: "No.",
                reasoning_content: "Checked.",
                tool_calls: [
                    {
                        id: "call_9",
                        function: { name: "weather", arguments: "{}" },
                    },
                ],
            },
        });
    });

    it("replays assistant refusals and accepts the explicit text format", async () => {
        let body: Record<string, unknown> | undefined;
        vi.spyOn(globalThis, "fetch").mockImplementationOnce(
            async (_input, init) => {
                body = JSON.parse(String(init?.body));
                return Response.json({
                    id: "resp_after_refusal",
                    object: "response",
                    model: "provider-model",
                    status: "completed",
                    output: [],
                    usage: usage(),
                });
            },
        );

        await callChatViaResponses(
            [
                { role: "assistant", content: null, refusal: "No." },
                { role: "user", content: "Try another way." },
            ],
            {
                model: "provider-model",
                modelConfig,
                response_format: { type: "text" },
            },
        );

        expect(body).toMatchObject({
            text: { format: { type: "text" } },
            input: [
                {
                    role: "assistant",
                    content: [{ type: "refusal", refusal: "No." }],
                },
                {
                    role: "user",
                    content: [{ type: "input_text", text: "Try another way." }],
                },
            ],
        });
    });

    it("rejects malformed upstream function calls", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            Response.json({
                id: "resp_bad_tool",
                object: "response",
                model: "provider-model",
                status: "completed",
                output: [{ type: "function_call", id: "item_only" }],
                usage: usage(),
            }),
        );

        await expect(
            callChatViaResponses([{ role: "user", content: "Call it" }], {
                model: "provider-model",
                modelConfig,
            }),
        ).rejects.toMatchObject({ status: 502 });
    });

    it("fails a stream when a completed function call is malformed", async () => {
        mockStream([
            'data: {"type":"response.output_item.added","item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"weather"}}\n\n',
            'data: {"type":"response.output_item.done","item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"weather"}}\n\n',
            `data: ${JSON.stringify({
                type: "response.completed",
                response: {
                    status: "completed",
                    output: [],
                    usage: usage(),
                },
            })}\n\n`,
        ]);

        const completion = await callChatViaResponses(
            [{ role: "user", content: "Call it" }],
            { model: "provider-model", modelConfig, stream: true },
        );
        const events = await streamEvents(completion);

        expect(events.at(-1)).toMatchObject({
            error: {
                message:
                    "Responses provider returned a malformed function call",
                code: "upstream_error",
            },
        });
        expect(events.some((event) => event?.usage)).toBe(false);
        expect(events).not.toContain("[DONE]");
    });

    it("streams text, reasoning, indexed tools, required usage, and DONE", async () => {
        mockStream([
            'data: {"type":"response.created","response":{"id":"resp_stream","created_at":123,"model":"provider-model"}}\n\n',
            'data: {"type":"response.reasoning_summary_text.delta","delta":"Think"}\n\n',
            'data: {"type":"response.output_item.added","item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"weather"}}\n\n',
            'data: {"type":"response.function_call_arguments.done","item_id":"fc_1","arguments":"{\\"city\\":\\"Paris\\"}"}\n\n',
            'data: {"type":"response.output_text.delta","delta":"Hello"}\n\n',
            `data: ${JSON.stringify({
                type: "response.completed",
                response: {
                    status: "completed",
                    output: [
                        {
                            type: "function_call",
                            id: "fc_1",
                            call_id: "call_1",
                            name: "weather",
                            arguments: '{"city":"Paris"}',
                        },
                    ],
                    usage: usage(),
                },
            })}\n\n`,
        ]);

        const completion = await callChatViaResponses(
            [{ role: "user", content: "Hi" }],
            { model: "provider-model", modelConfig, stream: true },
        );
        const events = await streamEvents(completion);

        expect(events[0]).toMatchObject({
            id: "resp_stream",
            choices: [{ delta: { role: "assistant" } }],
        });
        expect(events[1].choices[0].delta).toEqual({
            reasoning_content: "Think",
        });
        expect(events[2].choices[0].delta.tool_calls[0]).toMatchObject({
            index: 0,
            id: "call_1",
            function: { name: "weather", arguments: "" },
        });
        expect(events[3].choices[0].delta.tool_calls[0]).toMatchObject({
            index: 0,
            function: { arguments: '{"city":"Paris"}' },
        });
        expect(events[4].choices[0].delta).toEqual({ content: "Hello" });
        expect(events[5].choices[0].finish_reason).toBe("tool_calls");
        expect(events[6]).toMatchObject({
            choices: [],
            usage: {
                prompt_tokens: 10,
                prompt_tokens_details: { cache_write_tokens: 2 },
                completion_tokens: 5,
            },
        });
        expect(events[7]).toBe("[DONE]");
    });

    it("recovers output carried only by done and terminal events", async () => {
        mockStream([
            'data: {"type":"response.output_text.done","item_id":"msg_1","content_index":0,"text":"Whole answer"}\n\n',
            `data: ${JSON.stringify({
                type: "response.completed",
                response: {
                    id: "resp_terminal_only",
                    created_at: 456,
                    model: "provider-model",
                    status: "completed",
                    output: [
                        {
                            type: "message",
                            id: "msg_1",
                            content: [
                                { type: "output_text", text: "Whole answer" },
                            ],
                        },
                        {
                            type: "function_call",
                            id: "fc_1",
                            call_id: "call_1",
                            name: "weather",
                            arguments: "{}",
                        },
                    ],
                    usage: usage(),
                },
            })}\n\n`,
        ]);

        const completion = await callChatViaResponses(
            [{ role: "user", content: "Hi" }],
            { model: "provider-model", modelConfig, stream: true },
        );
        const events = await streamEvents(completion);

        expect(events[0].choices[0].delta).toEqual({
            role: "assistant",
            content: "",
        });
        expect(events[1].choices[0].delta).toEqual({
            content: "Whole answer",
        });
        expect(events[2].choices[0].delta.tool_calls[0]).toMatchObject({
            index: 0,
            id: "call_1",
            function: { name: "weather", arguments: "{}" },
        });
        expect(events[3].choices[0].finish_reason).toBe("tool_calls");
        expect(events[4]).toMatchObject({ choices: [], usage: {} });
        expect(events[5]).toBe("[DONE]");
    });

    it("accepts a terminal SSE event closed by EOF", async () => {
        mockStream([
            `data: ${JSON.stringify({
                type: "response.completed",
                response: {
                    id: "resp_eof",
                    status: "completed",
                    output: [],
                    usage: usage(),
                },
            })}`,
        ]);

        const completion = await callChatViaResponses(
            [{ role: "user", content: "Hi" }],
            { model: "provider-model", modelConfig, stream: true },
        );
        const events = await streamEvents(completion);

        expect(events.at(-2)).toMatchObject({ choices: [], usage: {} });
        expect(events.at(-1)).toBe("[DONE]");
    });

    it("fails closed when non-streaming usage is absent", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            Response.json({
                id: "resp_no_usage",
                object: "response",
                model: "provider-model",
                status: "completed",
                output: [],
            }),
        );

        await expect(
            callChatViaResponses([{ role: "user", content: "Hi" }], {
                model: "provider-model",
                modelConfig,
            }),
        ).rejects.toMatchObject({
            status: 502,
            message: expect.stringContaining("omitted usage"),
        });
    });

    it("fails closed when streaming usage is absent", async () => {
        mockStream([
            'data: {"type":"response.output_text.delta","delta":"partial"}\n\n',
            'data: {"type":"response.completed","response":{"status":"completed","output":[]}}\n\n',
        ]);
        const completion = await callChatViaResponses(
            [{ role: "user", content: "Hi" }],
            { model: "provider-model", modelConfig, stream: true },
        );
        completion.responseStream = requireChatStreamUsage(
            completion.responseStream as ReadableStream<
                Uint8Array<ArrayBuffer>
            >,
        );
        const events = await streamEvents(completion);

        expect(events).toContainEqual({
            error: {
                message: "Responses provider omitted valid terminal usage",
                type: "upstream_error",
                code: "usage_missing",
            },
        });
        expect(events).not.toContain("[DONE]");
    });

    it.each([
        ["n", { n: 2 }],
        ["stop", { stop: ["END"] }],
        ["seed", { seed: 42 }],
        ["logit_bias", { logit_bias: { "1": 1 } }],
        ["logprobs", { logprobs: true }],
        ["repetition penalty", { repetition_penalty: 1.1 }],
        ["legacy functions", { functions: [{ name: "old" }] }],
        ["stored state", { store: true }],
        ["previous response", { previous_response_id: "resp_previous" }],
        ["conversation", { conversation: "conv_previous" }],
        ["background", { background: true }],
        [
            "hosted search",
            { web_search_options: { search_context_size: "low" } },
        ],
    ])("rejects unsupported %s before calling upstream", async (_name, extra) => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        await expect(
            callChatViaResponses([{ role: "user", content: "Hi" }], {
                model: "provider-model",
                modelConfig,
                ...extra,
            } as TransformOptions),
        ).rejects.toMatchObject({
            status: 400,
            errorCode: "unsupported_parameter",
        });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("accepts named messages and drops the unsupported name field", () => {
        expect(
            chatToResponsesRequest(
                [
                    { role: "user", name: "alice", content: "Hi" },
                    {
                        role: "tool",
                        name: "weather",
                        tool_call_id: "call_1",
                        content: "sunny",
                    },
                ],
                { model: "provider-model" },
            ).input,
        ).toEqual([
            {
                role: "user",
                content: [{ type: "input_text", text: "Hi" }],
            },
            {
                type: "function_call_output",
                call_id: "call_1",
                output: "sunny",
            },
        ]);
    });

    it("rejects non-text tool output", async () => {
        await expect(
            callChatViaResponses(
                [
                    {
                        role: "tool",
                        tool_call_id: "call_1",
                        content: [
                            { type: "image_url", image_url: { url: "x" } },
                        ],
                    },
                ] as ChatMessage[],
                { model: "provider-model", modelConfig },
            ),
        ).rejects.toMatchObject({
            status: 400,
            errorCode: "unsupported_parameter",
        });
    });

    it("surfaces provider errors and truncated streams without DONE", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            Response.json(
                { error: { message: "bad request" } },
                { status: 400 },
            ),
        );
        await expect(
            callChatViaResponses([{ role: "user", content: "Hi" }], {
                model: "provider-model",
                modelConfig,
            }),
        ).rejects.toMatchObject({ status: 400, upstreamStatus: 400 });

        mockStream([
            'data: {"type":"response.output_text.delta","delta":"partial"}\n\n',
        ]);
        const streamed = await callChatViaResponses(
            [{ role: "user", content: "Hi" }],
            { model: "provider-model", modelConfig, stream: true },
        );
        const events = await streamEvents(streamed);
        expect(events).toContainEqual({
            error: {
                message:
                    "Responses provider ended unexpectedly before completion",
                type: "upstream_error",
                code: "upstream_error",
            },
        });
        expect(events).not.toContain("[DONE]");
    });
});
