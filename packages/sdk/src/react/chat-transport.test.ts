import { describe, expect, it, vi } from "vitest";
import type { TransportMessage } from "./chat-transport.js";
import {
    DEFAULT_GENERATION_URL,
    pollinationsTransport,
    responsesToChunks,
    toResponsesInput,
} from "./chat-transport.js";

function sseStream(events: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream<Uint8Array>({
        start(controller) {
            for (const event of events) {
                controller.enqueue(encoder.encode(`data: ${event}\n\n`));
            }
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
        },
    });
}

async function collectChunks(
    stream: ReadableStream<Record<string, unknown>>,
): Promise<Record<string, unknown>[]> {
    const chunks: Record<string, unknown>[] = [];
    const reader = stream.getReader();
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
    }
    return chunks;
}

describe("toResponsesInput", () => {
    it("converts a user text message to a message item", () => {
        const input = toResponsesInput([
            { role: "user", parts: [{ type: "text", text: "Hello" }] },
        ]);
        expect(input).toEqual([
            { role: "user", content: [{ type: "input_text", text: "Hello" }] },
        ]);
    });

    it("converts an assistant text message with output_text", () => {
        const input = toResponsesInput([
            { role: "assistant", parts: [{ type: "text", text: "Hi there" }] },
        ]);
        expect(input).toEqual([
            {
                role: "assistant",
                content: [{ type: "output_text", text: "Hi there" }],
            },
        ]);
    });

    it("replays a completed tool call with function_call and function_call_output", () => {
        const messages: TransportMessage[] = [
            { role: "user", parts: [{ type: "text", text: "What is 2+2?" }] },
            {
                role: "assistant",
                parts: [
                    { type: "text", text: "Let me calculate." },
                    {
                        type: "dynamic-tool",
                        toolCallId: "call_1",
                        toolName: "calculator",
                        input: { expression: "2+2" },
                        output: { result: 4 },
                        state: "output-available",
                    },
                ],
            },
        ];
        const input = toResponsesInput(messages);
        expect(input).toEqual([
            {
                role: "user",
                content: [{ type: "input_text", text: "What is 2+2?" }],
            },
            {
                role: "assistant",
                content: [{ type: "output_text", text: "Let me calculate." }],
            },
            {
                type: "function_call",
                call_id: "call_1",
                name: "calculator",
                arguments: '{"expression":"2+2"}',
            },
            {
                type: "function_call_output",
                call_id: "call_1",
                output: '{"result":4}',
            },
        ]);
    });

    it("keeps an in-progress tool call without output", () => {
        const messages: TransportMessage[] = [
            {
                role: "assistant",
                parts: [
                    {
                        type: "dynamic-tool",
                        toolCallId: "call_2",
                        toolName: "search",
                        input: { query: "test" },
                        state: "input-available",
                    },
                ],
            },
        ];
        const input = toResponsesInput(messages);
        expect(input).toEqual([
            {
                type: "function_call",
                call_id: "call_2",
                name: "search",
                arguments: '{"query":"test"}',
            },
        ]);
    });

    it("handles string content as fallback", () => {
        const input = toResponsesInput([{ role: "user", content: "Hello" }]);
        expect(input).toEqual([
            { role: "user", content: [{ type: "input_text", text: "Hello" }] },
        ]);
    });
});

describe("responsesToChunks", () => {
    it("streams text deltas", async () => {
        const chunks = await collectChunks(
            responsesToChunks(
                sseStream([
                    JSON.stringify({
                        type: "response.output_text.delta",
                        item_id: "text-1",
                        delta: "Hello",
                    }),
                    JSON.stringify({
                        type: "response.output_text.delta",
                        item_id: "text-1",
                        delta: " world",
                    }),
                    JSON.stringify({
                        type: "response.completed",
                        response: {
                            usage: { input_tokens: 10, output_tokens: 5 },
                        },
                    }),
                ]),
            ),
        );
        const types = chunks.map((c) => c.type);
        expect(types).toEqual([
            "text-start",
            "text-delta",
            "text-delta",
            "text-end",
            "finish",
        ]);
        expect(chunks[1]).toMatchObject({
            type: "text-delta",
            id: "text-1",
            delta: "Hello",
        });
        expect(chunks[4]).toMatchObject({
            type: "finish",
            finishReason: "stop",
            messageMetadata: {
                usage: { input_tokens: 10, output_tokens: 5 },
            },
        });
    });

    it("accumulates function_call arguments from deltas", async () => {
        const chunks = await collectChunks(
            responsesToChunks(
                sseStream([
                    JSON.stringify({
                        type: "response.output_item.added",
                        item: {
                            type: "function_call",
                            id: "fc-1",
                            call_id: "call_abc",
                            name: "get_weather",
                            arguments: "",
                        },
                    }),
                    JSON.stringify({
                        type: "response.function_call_arguments.delta",
                        item_id: "fc-1",
                        delta: '{"city',
                    }),
                    JSON.stringify({
                        type: "response.function_call_arguments.delta",
                        item_id: "fc-1",
                        delta: '":"Paris"}',
                    }),
                    JSON.stringify({
                        type: "response.function_call_arguments.done",
                        item_id: "fc-1",
                        arguments: '{"city":"Paris"}',
                    }),
                    JSON.stringify({
                        type: "response.output_item.done",
                        item: {
                            type: "function_call",
                            id: "fc-1",
                            call_id: "call_abc",
                            name: "get_weather",
                            arguments: '{"city":"Paris"}',
                        },
                    }),
                    JSON.stringify({
                        type: "response.completed",
                        response: {
                            usage: { input_tokens: 20, output_tokens: 10 },
                        },
                    }),
                ]),
            ),
        );

        const toolStart = chunks.find((c) => c.type === "tool-input-start");
        expect(toolStart).toMatchObject({
            toolCallId: "call_abc",
            toolName: "get_weather",
            dynamic: true,
        });

        const deltas = chunks.filter((c) => c.type === "tool-input-delta");
        expect(deltas).toHaveLength(2);
        expect(deltas[0]).toMatchObject({
            toolCallId: "call_abc",
            inputTextDelta: '{"city',
        });

        const available = chunks.find((c) => c.type === "tool-input-available");
        expect(available).toMatchObject({
            toolCallId: "call_abc",
            toolName: "get_weather",
            input: { city: "Paris" },
            dynamic: true,
        });
    });

    it("handles a replayed function_call with full arguments on added", async () => {
        const chunks = await collectChunks(
            responsesToChunks(
                sseStream([
                    JSON.stringify({
                        type: "response.output_item.added",
                        item: {
                            type: "function_call",
                            id: "fc-2",
                            call_id: "call_xyz",
                            name: "search",
                            arguments: '{"query":"test"}',
                        },
                    }),
                    JSON.stringify({
                        type: "response.completed",
                        response: {
                            usage: { input_tokens: 5, output_tokens: 3 },
                        },
                    }),
                ]),
            ),
        );

        const available = chunks.find((c) => c.type === "tool-input-available");
        expect(available).toMatchObject({
            toolCallId: "call_xyz",
            toolName: "search",
            input: { query: "test" },
            dynamic: true,
        });
    });

    it("emits tool-output-available for mcp_call done", async () => {
        const chunks = await collectChunks(
            responsesToChunks(
                sseStream([
                    JSON.stringify({
                        type: "response.output_item.added",
                        item: {
                            type: "mcp_call",
                            id: "mcp-1",
                            call_id: "mcp_call_1",
                            name: "get_data",
                            arguments: '{"id":42}',
                        },
                    }),
                    JSON.stringify({
                        type: "response.output_item.done",
                        item: {
                            type: "mcp_call",
                            id: "mcp-1",
                            call_id: "mcp_call_1",
                            name: "get_data",
                            arguments: '{"id":42}',
                            output: '{"result":"ok"}',
                        },
                    }),
                    JSON.stringify({
                        type: "response.completed",
                        response: {
                            usage: { input_tokens: 8, output_tokens: 4 },
                        },
                    }),
                ]),
            ),
        );

        const inputAvail = chunks.find(
            (c) => c.type === "tool-input-available",
        );
        expect(inputAvail).toMatchObject({
            toolCallId: "mcp_call_1",
            toolName: "get_data",
            input: { id: 42 },
            providerExecuted: true,
        });

        const outputAvail = chunks.find(
            (c) => c.type === "tool-output-available",
        );
        expect(outputAvail).toMatchObject({
            toolCallId: "mcp_call_1",
            output: { result: "ok" },
            providerExecuted: true,
        });
    });

    it("emits error chunk on response.failed", async () => {
        const chunks = await collectChunks(
            responsesToChunks(
                sseStream([
                    JSON.stringify({
                        type: "response.failed",
                        response: {
                            status: "failed",
                            error: { message: "Rate limit exceeded" },
                        },
                    }),
                ]),
            ),
        );
        const errorChunk = chunks.find((c) => c.type === "error");
        expect(errorChunk).toMatchObject({ errorText: "Rate limit exceeded" });
        const finish = chunks.find((c) => c.type === "finish");
        expect(finish).toMatchObject({ finishReason: "error" });
    });

    it("uses finishReason length on response.incomplete", async () => {
        const chunks = await collectChunks(
            responsesToChunks(
                sseStream([
                    JSON.stringify({
                        type: "response.incomplete",
                        response: {
                            status: "incomplete",
                            incomplete_details: { reason: "max_output_tokens" },
                        },
                    }),
                ]),
            ),
        );
        const finish = chunks.find((c) => c.type === "finish");
        expect(finish).toMatchObject({ finishReason: "length" });
    });
});

describe("pollinationsTransport", () => {
    it("sends a POST to /v1/responses with auth header", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            body: sseStream([]),
        });

        const transport = pollinationsTransport({
            apiKey: "sk_test_123",
            baseUrl: "https://gen.example.com",
            fetch: fetchMock as unknown as typeof fetch,
        });

        const messages: TransportMessage[] = [
            { role: "user", parts: [{ type: "text", text: "Hi" }] },
        ];

        const stream = await transport.sendMessages({ messages });
        expect(stream).toBeInstanceOf(ReadableStream);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("https://gen.example.com/v1/responses");
        expect(init.method).toBe("POST");
        const headers = init.headers as Record<string, string>;
        expect(headers.Authorization).toBe("Bearer sk_test_123");
        expect(headers["Content-Type"]).toBe("application/json");
        const body = JSON.parse(init.body as string) as Record<string, unknown>;
        expect(body.stream).toBe(true);
        expect(body.store).toBe(false);
        expect(body.input).toEqual([
            { role: "user", content: [{ type: "input_text", text: "Hi" }] },
        ]);
    });

    it("throws PollinationsError on non-ok response", async () => {
        const errorBody = {
            error: { code: "UNAUTHORIZED", message: "Invalid key" },
        };
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 401,
            statusText: "Unauthorized",
            headers: new Headers(),
            json: async () => errorBody,
        });

        const transport = pollinationsTransport({
            apiKey: "sk_bad",
            fetch: fetchMock as unknown as typeof fetch,
        });

        await expect(
            transport.sendMessages({
                messages: [
                    { role: "user", parts: [{ type: "text", text: "Hi" }] },
                ],
            }),
        ).rejects.toThrow("Invalid key");
    });

    it("resolves apiKey from a function", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            body: sseStream([]),
        });

        const transport = pollinationsTransport({
            apiKey: () => "sk_from_fn",
            fetch: fetchMock as unknown as typeof fetch,
        });

        await transport.sendMessages({
            messages: [{ role: "user", parts: [{ type: "text", text: "Hi" }] }],
        });

        const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        const headers = init.headers as Record<string, string>;
        expect(headers.Authorization).toBe("Bearer sk_from_fn");
    });

    it("throws when apiKey is empty", async () => {
        const transport = pollinationsTransport({
            apiKey: "",
        });
        await expect(
            transport.sendMessages({
                messages: [
                    { role: "user", parts: [{ type: "text", text: "Hi" }] },
                ],
            }),
        ).rejects.toThrow("A Pollinations API key is required");
    });
});
