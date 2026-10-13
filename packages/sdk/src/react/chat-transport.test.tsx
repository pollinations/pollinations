import { readUIMessageStream } from "ai";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    type PolliUIMessage,
    polliChatTransport,
    toResponsesInput,
    usePolliChatTransport,
} from "./chat-transport.js";
import { AuthContext, type AuthContextValue } from "./contexts.js";

function sse(events: unknown[]): Response {
    const text = events
        .map((event) => `data: ${JSON.stringify(event)}\n\n`)
        .join("");
    return new Response(`${text}data: [DONE]\n\n`, {
        headers: { "Content-Type": "text/event-stream" },
    });
}

const user = (text: string): PolliUIMessage => ({
    id: "u1",
    role: "user",
    parts: [{ type: "text", text }],
});

async function send(
    transport: ReturnType<typeof polliChatTransport>,
    messages: PolliUIMessage[] = [user("hi")],
    abortSignal?: AbortSignal,
) {
    return transport.sendMessages({
        trigger: "submit-message",
        chatId: "chat",
        messageId: undefined,
        messages,
        abortSignal,
    });
}

async function lastMessage(stream: ReadableStream<unknown>) {
    let last: PolliUIMessage | undefined;
    for await (const message of readUIMessageStream<PolliUIMessage>({
        stream: stream as never,
        terminateOnError: true,
    })) {
        last = message;
    }
    return last;
}

const usage = { input_tokens: 3, output_tokens: 2, total_tokens: 5 };

describe("polliChatTransport", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("streams text and usage from /v1/responses with the user's key", async () => {
        const output = [
            {
                type: "message",
                id: "msg_1",
                role: "assistant",
                content: [{ type: "output_text", text: "Hello!" }],
            },
        ];
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            sse([
                { type: "response.created", response: {} },
                {
                    type: "response.output_text.delta",
                    item_id: "msg_1",
                    delta: "Hel",
                },
                {
                    type: "response.output_text.delta",
                    item_id: "msg_1",
                    delta: "lo!",
                },
                { type: "response.completed", response: { output, usage } },
            ]),
        );

        const transport = polliChatTransport({
            apiKey: "pk_user",
            model: "openai",
        });
        const message = await lastMessage(await send(transport));

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("https://gen.pollinations.ai/v1/responses");
        expect(new Headers(init?.headers).get("Authorization")).toBe(
            "Bearer pk_user",
        );
        expect(JSON.parse(String(init?.body))).toEqual({
            model: "openai",
            input: [
                {
                    type: "message",
                    role: "user",
                    content: [{ type: "input_text", text: "hi" }],
                },
            ],
            stream: true,
            store: false,
        });
        expect(message?.parts).toContainEqual(
            expect.objectContaining({ type: "text", text: "Hello!" }),
        );
        expect(message?.metadata).toEqual({ usage, output });
    });

    it("shows server-run tool calls with their results and errors", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            sse([
                {
                    type: "response.output_item.added",
                    item: {
                        type: "mcp_call",
                        id: "call_1",
                        name: "generate_image",
                        arguments: '{"prompt":"cat"}',
                    },
                },
                {
                    type: "response.output_item.done",
                    item: {
                        type: "mcp_call",
                        id: "call_1",
                        name: "generate_image",
                        arguments: '{"prompt":"cat"}',
                        status: "completed",
                        output: '{"url":"https://media.example/cat.png"}',
                    },
                },
                {
                    type: "response.output_item.added",
                    item: {
                        type: "mcp_call",
                        id: "call_2",
                        name: "search",
                        arguments: "{}",
                    },
                },
                {
                    type: "response.output_item.done",
                    item: {
                        type: "mcp_call",
                        id: "call_2",
                        name: "search",
                        arguments: "{}",
                        status: "failed",
                        error: { message: "search is down" },
                    },
                },
                {
                    type: "response.output_text.delta",
                    item_id: "msg_1",
                    delta: "Here is your cat.",
                },
                { type: "response.completed", response: { output: [], usage } },
            ]),
        );

        const message = await lastMessage(
            await send(polliChatTransport({ apiKey: "pk_user" })),
        );

        expect(message?.parts).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: "dynamic-tool",
                    toolName: "generate_image",
                    toolCallId: "call_1",
                    state: "output-available",
                    input: { prompt: "cat" },
                    output: { url: "https://media.example/cat.png" },
                }),
                expect.objectContaining({
                    type: "dynamic-tool",
                    toolName: "search",
                    state: "output-error",
                    errorText: "search is down",
                }),
                expect.objectContaining({
                    type: "text",
                    text: "Here is your cat.",
                }),
            ]),
        );
    });

    it("turns failed responses and HTTP errors into errors", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            sse([
                {
                    type: "response.failed",
                    response: { error: { message: "model overloaded" } },
                },
            ]),
        );
        const transport = polliChatTransport({ apiKey: "pk_user" });
        await expect(lastMessage(await send(transport))).rejects.toThrow(
            "model overloaded",
        );

        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            new Response(
                JSON.stringify({ error: { message: "Insufficient pollen" } }),
                { status: 402 },
            ),
        );
        await expect(send(transport)).rejects.toThrow("Insufficient pollen");
    });

    it("fails a stream that ends without a terminal event", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            sse([
                {
                    type: "response.output_text.delta",
                    item_id: "m",
                    delta: "partial",
                },
            ]),
        );
        const transport = polliChatTransport({ apiKey: "pk_user" });
        await expect(lastMessage(await send(transport))).rejects.toThrow(
            "ended early",
        );
    });

    it("refuses to send without a key", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch");
        await expect(
            send(polliChatTransport({ apiKey: () => null })),
        ).rejects.toThrow("Log in to Pollinations first");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("sends to a custom base URL and merges extra body fields", async () => {
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(sse([]));
        const transport = polliChatTransport({
            apiKey: "pk_user",
            model: "openai",
            baseUrl: "http://localhost:8788//",
            body: { instructions: "Be brief." },
        });
        await transport.sendMessages({
            trigger: "submit-message",
            chatId: "chat",
            messageId: undefined,
            messages: [user("hi")],
            abortSignal: undefined,
            body: { temperature: 0.2 },
        });
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("http://localhost:8788/v1/responses");
        expect(JSON.parse(String(init?.body))).toMatchObject({
            model: "openai",
            instructions: "Be brief.",
            temperature: 0.2,
            stream: true,
            store: false,
        });
    });

    it("replays the previous reply's output items as history", () => {
        const output = [
            { type: "mcp_call", id: "call_1", name: "x", arguments: "{}" },
            { type: "message", id: "msg_1", role: "assistant", content: [] },
        ];
        expect(
            toResponsesInput([
                user("draw a cat"),
                {
                    id: "a1",
                    role: "assistant",
                    parts: [{ type: "text", text: "Done" }],
                    metadata: { output },
                },
                {
                    id: "a2",
                    role: "assistant",
                    parts: [{ type: "text", text: "Earlier reply" }],
                },
                {
                    id: "u2",
                    role: "user",
                    parts: [
                        { type: "text", text: "and this?" },
                        {
                            type: "file",
                            mediaType: "image/png",
                            url: "https://media.example/dog.png",
                        },
                    ],
                },
            ]),
        ).toEqual([
            {
                type: "message",
                role: "user",
                content: [{ type: "input_text", text: "draw a cat" }],
            },
            ...output,
            {
                role: "assistant",
                content: [{ type: "output_text", text: "Earlier reply" }],
            },
            {
                type: "message",
                role: "user",
                content: [
                    { type: "input_text", text: "and this?" },
                    {
                        type: "input_image",
                        image_url: "https://media.example/dog.png",
                        detail: "auto",
                    },
                ],
            },
        ]);
    });
});

describe("usePolliChatTransport", () => {
    let renderer: ReactTestRenderer | null = null;

    afterEach(async () => {
        await act(async () => renderer?.unmount());
        renderer = null;
        vi.restoreAllMocks();
    });

    function authValue(apiKey: string | null): AuthContextValue {
        return {
            apiKey,
            isLoggedIn: !!apiKey,
            isHydrated: true,
            error: null,
            login: vi.fn(),
            logout: vi.fn(),
            setApiKey: vi.fn(),
            enterUrl: "https://enter.example",
            apiBaseUrl: "https://enter.example/api",
        };
    }

    it("uses the provider key and aborts the stream when the key changes", async () => {
        const signals: AbortSignal[] = [];
        const keys: (string | null)[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation((_url, init = {}) => {
            keys.push(new Headers(init.headers).get("Authorization"));
            if (init.signal) signals.push(init.signal);
            return Promise.resolve(sse([]));
        });

        const transports: ReturnType<typeof usePolliChatTransport>[] = [];
        const models: string[] = [];
        function Probe({ model }: { model: string }) {
            transports.push(usePolliChatTransport({ model }));
            return null;
        }
        const tree = (key: string | null, model = "openai") => (
            <AuthContext.Provider value={authValue(key)}>
                <Probe model={model} />
            </AuthContext.Provider>
        );
        const fetchMock = vi.mocked(globalThis.fetch);
        const lastModel = () =>
            JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body)).model;

        await act(async () => {
            renderer = create(tree("pk_alice"));
        });
        const transport = transports[transports.length - 1];
        await send(transport);
        models.push(lastModel());
        expect(keys).toEqual(["Bearer pk_alice"]);
        expect(signals[0].aborted).toBe(false);

        await act(async () => {
            renderer?.update(tree("pk_bob", "mistral"));
        });
        expect(signals[0].aborted).toBe(true);
        expect(transports[transports.length - 1]).toBe(transport);

        await send(transport);
        models.push(lastModel());
        expect(keys).toEqual(["Bearer pk_alice", "Bearer pk_bob"]);
        expect(models).toEqual(["openai", "mistral"]);

        await act(async () => {
            renderer?.update(tree(null));
        });
        await expect(send(transport)).rejects.toThrow(
            "Log in to Pollinations first",
        );
    });

    it("forwards useChat's stop signal", async () => {
        let signal: AbortSignal | undefined;
        vi.spyOn(globalThis, "fetch").mockImplementation((_url, init = {}) => {
            signal = init.signal ?? undefined;
            return Promise.resolve(sse([]));
        });
        let transport: ReturnType<typeof usePolliChatTransport> | null = null;
        function Probe() {
            transport = usePolliChatTransport();
            return null;
        }
        await act(async () => {
            renderer = create(
                <AuthContext.Provider value={authValue("pk_user")}>
                    <Probe />
                </AuthContext.Provider>,
            );
        });
        const stop = new AbortController();
        if (!transport) throw new Error("transport not set");
        await send(transport, [user("hi")], stop.signal);
        stop.abort();
        expect(signal?.aborted).toBe(true);
    });
});
