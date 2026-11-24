import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PollinationsError } from "../types.js";
import {
    type ChatMessage,
    createResponsesTransport,
    type PollinationsChatChunk,
    usePollinationsChatTransport,
} from "./chat-transport.js";
import { AuthContext, type AuthContextValue } from "./contexts.js";

const messages: ChatMessage[] = [
    { role: "user", parts: [{ type: "text", text: "hi" }] },
];

const delta = {
    type: "response.output_text.delta",
    item_id: "msg_1",
    content_index: 0,
    delta: "Hel",
};

function sse(events: object[]): string {
    return events
        .map((event) => {
            const { type } = event as { type: string };
            return `event: ${type}
data: ${JSON.stringify(event)}

`;
        })
        .join("");
}

function sseResponse(body: string): Response {
    return new Response(body, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
    });
}

/** Body that delivers one delta, then errors when the request is aborted. */
function sseUntilAborted(_url: unknown, init?: RequestInit): Promise<Response> {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(encoder.encode(sse([delta])));
            init?.signal?.addEventListener("abort", () =>
                controller.error(new DOMException("Aborted", "AbortError")),
            );
        },
    });
    return Promise.resolve(new Response(body, { status: 200 }));
}

async function collect(
    stream: ReadableStream<PollinationsChatChunk>,
): Promise<PollinationsChatChunk[]> {
    const reader = stream.getReader();
    const chunks: PollinationsChatChunk[] = [];
    while (true) {
        const { done, value } = await reader.read();
        if (done) return chunks;
        chunks.push(value);
    }
}

function authValue(
    overrides: Partial<AuthContextValue> = {},
): AuthContextValue {
    return {
        apiKey: "sk_test",
        isLoggedIn: true,
        isHydrated: true,
        error: null,
        login: vi.fn(),
        logout: vi.fn(),
        setApiKey: vi.fn(),
        enterUrl: "https://enter.example",
        apiBaseUrl: "https://enter.example/api",
        ...overrides,
    };
}

function transportWithKey(apiKey: string | null = "sk_test") {
    return createResponsesTransport(() => ({ apiKey, model: "openai" }));
}

describe("responses chat transport", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("streams text deltas and usage from the Responses SSE", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            sseResponse(
                sse([
                    delta,
                    { ...delta, delta: "lo" },
                    {
                        type: "response.completed",
                        response: {
                            usage: {
                                input_tokens: 3,
                                output_tokens: 2,
                                total_tokens: 5,
                            },
                        },
                    },
                ]),
            ),
        );

        const stream = await transportWithKey().sendMessages({
            messages,
            body: { temperature: 0 },
        });

        expect(await collect(stream)).toEqual([
            { type: "start" },
            { type: "text-start", id: "msg_1" },
            { type: "text-delta", id: "msg_1", delta: "Hel" },
            { type: "text-delta", id: "msg_1", delta: "lo" },
            { type: "text-end", id: "msg_1" },
            {
                type: "finish",
                finishReason: "stop",
                messageMetadata: {
                    usage: {
                        input_tokens: 3,
                        output_tokens: 2,
                        total_tokens: 5,
                    },
                },
            },
        ]);
        const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
        expect(fetchMock.mock.calls[0]?.[0]).toBe(
            "https://gen.pollinations.ai/v1/responses",
        );
        expect(init.headers).toEqual(
            expect.objectContaining({ Authorization: "Bearer sk_test" }),
        );
        expect(JSON.parse(String(init.body))).toEqual({
            model: "openai",
            temperature: 0,
            input: [{ role: "user", content: "hi" }],
            stream: true,
        });
    });

    it("shows a gateway refusal as answer text", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            sseResponse(
                sse([
                    {
                        type: "response.refusal.delta",
                        item_id: "msg_1",
                        content_index: 0,
                        delta: "I cannot help with that.",
                    },
                    { type: "response.completed", response: {} },
                ]),
            ),
        );
        const stream = await transportWithKey().sendMessages({ messages });
        expect(await collect(stream)).toContainEqual({
            type: "text-delta",
            id: "msg_1",
            delta: "I cannot help with that.",
        });
    });

    it("maps server-run MCP calls and their results to tool parts", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            sseResponse(
                sse([
                    {
                        type: "response.output_item.done",
                        item: {
                            type: "function_call",
                            call_id: "call_1",
                            name: "mcp__search__find",
                            arguments: '{"q":"x"}',
                        },
                    },
                    {
                        type: "response.output_item.done",
                        item: {
                            type: "function_call_output",
                            call_id: "call_1",
                            output: [
                                {
                                    type: "input_text",
                                    text: JSON.stringify({
                                        content: [
                                            { type: "text", text: "hit" },
                                        ],
                                    }),
                                },
                            ],
                        },
                    },
                    { type: "response.completed", response: {} },
                ]),
            ),
        );

        const chunks = await collect(
            await transportWithKey().sendMessages({ messages }),
        );

        expect(chunks.slice(1)).toEqual([
            {
                type: "tool-input-available",
                toolCallId: "call_1",
                toolName: "mcp__search__find",
                input: { q: "x" },
                dynamic: true,
                providerExecuted: true,
            },
            {
                type: "tool-output-available",
                toolCallId: "call_1",
                output: { content: [{ type: "text", text: "hit" }] },
                dynamic: true,
                providerExecuted: true,
            },
            {
                type: "finish",
                finishReason: "stop",
                messageMetadata: { usage: null },
            },
        ]);
    });

    it("reports a failed MCP tool as a tool error", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            sseResponse(
                sse([
                    {
                        type: "response.output_item.done",
                        item: {
                            type: "function_call_output",
                            call_id: "call_2",
                            output: [
                                {
                                    type: "input_text",
                                    text: JSON.stringify({
                                        isError: true,
                                        content: [
                                            { type: "text", text: "boom" },
                                        ],
                                    }),
                                },
                            ],
                        },
                    },
                ]),
            ),
        );

        const chunks = await collect(
            await transportWithKey().sendMessages({ messages }),
        );

        expect(chunks).toContainEqual({
            type: "tool-output-error",
            toolCallId: "call_2",
            errorText: "boom",
            dynamic: true,
            providerExecuted: true,
        });
    });

    it("replays server tool calls and results unchanged on the next turn", async () => {
        const output = [
            {
                type: "function_call",
                call_id: "call_1",
                name: "mcp__search__find",
                arguments: '{"q":"x"}',
            },
            {
                type: "function_call_output",
                call_id: "call_1",
                output: [{ type: "input_text", text: '{"content":[]}' }],
            },
            {
                type: "message",
                role: "assistant",
                content: [{ type: "output_text", text: "Found it" }],
            },
        ];
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(async () =>
                sseResponse(
                    sse([{ type: "response.completed", response: { output } }]),
                ),
            );
        const transport = transportWithKey();
        const chunks = await collect(
            await transport.sendMessages({ messages }),
        );
        const finish = chunks.find((chunk) => chunk.type === "finish");
        expect(finish?.messageMetadata.output).toEqual(output);

        await collect(
            await transport.sendMessages({
                messages: [
                    ...messages,
                    {
                        role: "assistant",
                        parts: [{ type: "text", text: "Found it" }],
                        metadata: finish?.messageMetadata,
                    },
                    {
                        role: "user",
                        parts: [
                            { type: "text", text: "What did the tool return?" },
                        ],
                    },
                ],
            }),
        );
        const input = JSON.parse(
            String(fetchMock.mock.calls[1]?.[1]?.body),
        ).input;
        expect(input).toEqual([
            { role: "user", content: "hi" },
            ...output,
            { role: "user", content: "What did the tool return?" },
        ]);
    });

    it("ignores caller-run function calls", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            sseResponse(
                sse([
                    {
                        type: "response.output_item.done",
                        item: {
                            type: "function_call",
                            call_id: "call_3",
                            name: "get_weather",
                            arguments: '{"city":"Paris"}',
                        },
                    },
                    { type: "response.completed", response: {} },
                ]),
            ),
        );

        const chunks = await collect(
            await transportWithKey().sendMessages({ messages }),
        );

        expect(chunks.map((chunk) => chunk.type)).toEqual(["start", "finish"]);
    });

    it("emits one error when the stream reports both error and response.failed", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            sseResponse(
                sse([
                    {
                        type: "error",
                        message: "Provider failed",
                    },
                    {
                        type: "response.failed",
                        response: { error: { message: "Provider failed" } },
                    },
                ]),
            ),
        );

        const chunks = await collect(
            await transportWithKey().sendMessages({ messages }),
        );

        expect(chunks).toEqual([
            { type: "start" },
            { type: "error", errorText: "Provider failed" },
        ]);
    });

    it("ends with an error when the stream closes before a terminal event", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            sseResponse(sse([delta])),
        );

        const chunks = await collect(
            await transportWithKey().sendMessages({ messages }),
        );

        expect(chunks.at(-1)).toEqual({
            type: "error",
            errorText: "Responses stream ended before completion",
        });
        expect(chunks.some((chunk) => chunk.type === "finish")).toBe(false);
    });

    it("throws the Pollinations error for a rejected request", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(
                JSON.stringify({
                    error: { code: "UNAUTHORIZED", message: "Invalid API key" },
                }),
                { status: 401 },
            ),
        );

        await expect(
            transportWithKey().sendMessages({ messages }),
        ).rejects.toBeInstanceOf(PollinationsError);
    });

    it("sends nothing without a key", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch");

        await expect(
            transportWithKey(null).sendMessages({ messages }),
        ).rejects.toMatchObject({ status: 401 });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("sends nothing when the caller has already stopped", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch");
        await expect(
            transportWithKey().sendMessages({
                messages,
                abortSignal: AbortSignal.abort(),
            }),
        ).rejects.toMatchObject({ name: "AbortError" });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("a stop aborts the stream with AbortError and no error chunk", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementation(sseUntilAborted);
        const controller = new AbortController();
        const stream = await transportWithKey().sendMessages({
            messages,
            abortSignal: controller.signal,
        });
        const reader = stream.getReader();
        const chunks: PollinationsChatChunk[] = [];
        let failure: unknown;
        for (let i = 0; i < 3; i++) {
            chunks.push((await reader.read()).value as PollinationsChatChunk);
        }
        controller.abort();
        try {
            await reader.read();
        } catch (err) {
            failure = err;
        }

        expect((failure as Error | undefined)?.name).toBe("AbortError");
        expect(chunks.some((chunk) => chunk.type === "error")).toBe(false);
    });

    it("a key change aborts the streams of the previous key", async () => {
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(sseUntilAborted);
        const probe: {
            transport?: ReturnType<typeof createResponsesTransport>;
        } = {};
        function Probe() {
            probe.transport = usePollinationsChatTransport({ model: "openai" });
            return null;
        }
        const element = (apiKey: string) => (
            <AuthContext.Provider value={authValue({ apiKey })}>
                <Probe />
            </AuthContext.Provider>
        );
        let renderer: ReactTestRenderer | undefined;
        await act(async () => {
            renderer = create(element("sk_test"));
        });
        const transport = probe.transport;
        if (!transport) throw new Error("Expected transport");
        await transport.sendMessages({ messages });

        await act(async () => {
            renderer?.update(element("sk_other"));
        });

        expect(probe.transport).toBe(transport);
        expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    });
});
