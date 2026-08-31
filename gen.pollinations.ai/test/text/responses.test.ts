import {
    type CreateResponseRequest,
    CreateResponseRequestSchema,
    CreateResponseResponseSchema,
} from "@shared/schemas/openai.ts";
import { describe, expect, it } from "vitest";
import {
    chatCompletionStreamToResponseStream,
    chatCompletionToResponse,
    responseRequestToChatRequest,
} from "@/text/responses.ts";

const request = (
    overrides: Partial<CreateResponseRequest> = {},
): CreateResponseRequest => ({
    model: "openai-fast",
    input: "Hello",
    stream: false,
    store: false,
    safe: "false",
    ...overrides,
});

describe("Responses API adapter", () => {
    it.each([
        ["store", { store: true }],
        ["previous_response_id", { previous_response_id: "resp_previous" }],
        ["conversation", { conversation: "conv_previous" }],
        ["background", { background: true }],
        ["encrypted reasoning", { include: ["reasoning.encrypted_content"] }],
        ["reasoning summaries", { reasoning: { summary: "auto" } }],
        ["automatic truncation", { truncation: "auto" }],
    ])("rejects stateless-unsupported %s", (_name, field) => {
        expect(() =>
            CreateResponseRequestSchema.parse({
                model: "openai-fast",
                input: "Hello",
                ...field,
            }),
        ).toThrow();
    });

    it("rejects hosted tools instead of silently dropping them", () => {
        expect(() =>
            responseRequestToChatRequest(
                request({ tools: [{ type: "web_search_preview" }] }),
            ),
        ).toThrow(/only function tools are supported/);
    });

    it("maps instructions, multimodal input, and function tools to Chat", () => {
        expect(
            responseRequestToChatRequest(
                request({
                    instructions: "Be concise",
                    input: [
                        {
                            type: "message",
                            role: "user",
                            content: [
                                { type: "input_text", text: "Describe" },
                                {
                                    type: "input_image",
                                    image_url: "https://example.com/image.png",
                                },
                            ],
                        },
                    ],
                    tools: [
                        {
                            type: "function",
                            name: "lookup",
                            parameters: { type: "object" },
                            strict: true,
                        },
                    ],
                    tool_choice: { type: "function", name: "lookup" },
                    max_output_tokens: 42,
                }),
            ),
        ).toMatchObject({
            messages: [
                { role: "developer", content: "Be concise" },
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Describe" },
                        {
                            type: "image_url",
                            image_url: {
                                url: "https://example.com/image.png",
                            },
                        },
                    ],
                },
            ],
            max_completion_tokens: 42,
            tools: [
                {
                    type: "function",
                    function: {
                        name: "lookup",
                        parameters: { type: "object" },
                        strict: true,
                    },
                },
            ],
            tool_choice: { type: "function", function: { name: "lookup" } },
        });
    });

    it("round-trips stateless function call history", () => {
        const result = responseRequestToChatRequest(
            request({
                input: [
                    {
                        type: "function_call",
                        call_id: "call_1",
                        name: "lookup",
                        arguments: '{"city":"Berlin"}',
                    },
                    {
                        type: "function_call_output",
                        call_id: "call_1",
                        output: "sunny",
                    },
                ],
            }),
        );

        expect(result.messages).toEqual([
            {
                role: "assistant",
                content: null,
                tool_calls: [
                    {
                        id: "call_1",
                        type: "function",
                        function: {
                            name: "lookup",
                            arguments: '{"city":"Berlin"}',
                        },
                    },
                ],
            },
            { role: "tool", tool_call_id: "call_1", content: "sunny" },
        ]);
    });

    it("maps output text, function calls, usage, and length termination", () => {
        const response = chatCompletionToResponse(
            {
                id: "chat_1",
                object: "chat.completion",
                created: 1_700_000_000,
                model: "openai-fast",
                choices: [
                    {
                        finish_reason: "length",
                        message: {
                            role: "assistant",
                            content: "Partial",
                            tool_calls: [
                                {
                                    id: "call_1",
                                    type: "function",
                                    function: {
                                        name: "lookup",
                                        arguments: "{}",
                                    },
                                },
                            ],
                        },
                    },
                ],
                usage: {
                    prompt_tokens: 5,
                    completion_tokens: 3,
                    total_tokens: 8,
                },
            },
            request(),
        );

        expect(response).toMatchObject({
            object: "response",
            completed_at: expect.any(Number),
            status: "incomplete",
            incomplete_details: { reason: "max_output_tokens" },
            output_text: "Partial",
            output: [
                { type: "message", role: "assistant" },
                {
                    type: "function_call",
                    call_id: "call_1",
                    name: "lookup",
                    arguments: "{}",
                },
            ],
            usage: { input_tokens: 5, output_tokens: 3, total_tokens: 8 },
            store: false,
            truncation: "disabled",
            service_tier: "default",
        });
        expect(() =>
            CreateResponseResponseSchema.parse(response),
        ).not.toThrow();
    });

    it("maps content filtering to an incomplete response", () => {
        expect(
            chatCompletionToResponse(
                {
                    model: "openai-fast",
                    choices: [
                        {
                            finish_reason: "content_filter",
                            message: { role: "assistant", content: "" },
                        },
                    ],
                },
                request(),
            ),
        ).toMatchObject({
            status: "incomplete",
            incomplete_details: { reason: "content_filter" },
        });
    });

    it("emits the Responses streaming lifecycle and final usage", async () => {
        const encoder = new TextEncoder();
        const source = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(
                    encoder.encode(
                        'data: {"model":"openai-fast","choices":[{"delta":{"content":"Hel"},"index":0}]}\n\n',
                    ),
                );
                controller.enqueue(
                    encoder.encode(
                        'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop","index":0}]}\n\n' +
                            'data: {"choices":[],"usage":{"prompt_tokens":2,"completion_tokens":1,"total_tokens":3}}\n\n' +
                            "data: [DONE]\n\n",
                    ),
                );
                controller.close();
            },
        });

        const output = await new Response(
            chatCompletionStreamToResponseStream(
                source,
                request({ stream: true }),
            ),
        ).text();

        expect(output).toContain("event: response.created");
        expect(output).toContain("event: response.output_text.delta");
        expect(output).toContain('"delta":"Hel"');
        expect(output).toContain("event: response.output_text.done");
        expect(output).toContain("event: response.completed");
        expect(output).toContain('"input_tokens":2');
        expect(output).toContain("data: [DONE]");
    });

    it("assembles streaming function-call argument deltas", async () => {
        const source = new Response(
            [
                'data: {"model":"openai-fast","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"lookup","arguments":"{\\"city\\":"}}]}}]}',
                "",
                'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"Berlin\\"}"}}]},"finish_reason":null}]}',
                "",
                'data: {"choices":[{"index":0,"delta":{"content":"Checking"},"finish_reason":"stop"}]}',
                "",
                'data: {"model":"openai-fast","choices":[],"usage":{"prompt_tokens":4,"completion_tokens":2,"total_tokens":6}}',
                "",
                "data: [DONE]",
                "",
            ].join("\n"),
        ).body as ReadableStream<Uint8Array>;

        const output = await new Response(
            chatCompletionStreamToResponseStream(
                source,
                request({ stream: true }),
            ),
        ).text();

        expect(output).toContain(
            "event: response.function_call_arguments.delta",
        );
        expect(output).toContain(
            "event: response.function_call_arguments.done",
        );
        expect(output).toContain('"call_id":"call_1"');
        expect(output).toContain('"arguments":"{\\"city\\":\\"Berlin\\"}"');
        expect(output).toContain("event: response.completed");
        const events = output
            .split("\n")
            .filter(
                (line) => line.startsWith("data: ") && line !== "data: [DONE]",
            )
            .map((line) => JSON.parse(line.slice(6)));
        expect(
            events.find(
                (event) =>
                    event.type === "response.output_item.added" &&
                    event.item.type === "function_call",
            )?.output_index,
        ).toBe(0);
        expect(
            events.find(
                (event) =>
                    event.type === "response.output_item.added" &&
                    event.item.type === "message",
            )?.output_index,
        ).toBe(1);
        expect(
            events.find((event) => event.type === "response.completed")
                ?.response.output,
        ).toEqual([
            expect.objectContaining({ type: "function_call" }),
            expect.objectContaining({ type: "message" }),
        ]);
    });

    it("turns malformed upstream stream data into Responses error events", async () => {
        const source = new Response("data: {not-json}\n\n")
            .body as ReadableStream<Uint8Array>;
        const output = await new Response(
            chatCompletionStreamToResponseStream(
                source,
                request({ stream: true }),
            ),
        ).text();
        const events = output
            .split("\n")
            .filter(
                (line) => line.startsWith("data: ") && line !== "data: [DONE]",
            )
            .map((line) => JSON.parse(line.slice(6)));
        expect(events).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: "error",
                    error: expect.objectContaining({
                        code: "server_error",
                        param: null,
                    }),
                }),
                expect.objectContaining({ type: "response.failed" }),
            ]),
        );
    });
});
