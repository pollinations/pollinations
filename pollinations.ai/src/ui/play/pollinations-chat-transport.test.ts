import { readUIMessageStream } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    type PollinationsUIMessage,
    pollinationsChatTransport,
    responsesInput,
} from "./pollinations-chat-transport";

const USER: PollinationsUIMessage = {
    id: "user-1",
    role: "user",
    parts: [{ type: "text", text: "Draw bees" }],
};

const message = (id: string, text: string) => ({
    type: "message",
    id,
    role: "assistant",
    status: "completed",
    content: [{ type: "output_text", text, annotations: [] }],
});

const IMAGE_CALL = {
    type: "mcp_call",
    id: "mcp_image",
    server_label: "pollinations",
    name: "generateImage",
    arguments: '{"prompt":"bees"}',
    approval_request_id: null,
    status: "completed",
    output: JSON.stringify({
        content: [
            {
                type: "resource_link",
                uri: "https://media.example.test/bees.png",
                name: "Generated image",
                mimeType: "image/png",
            },
            { type: "text", text: "Seed 42" },
        ],
    }),
    error: null,
};

const SEARCH_CALL = {
    type: "mcp_call",
    id: "mcp_search",
    server_label: "web",
    name: "search",
    arguments: '{"query":"bees"}',
    approval_request_id: null,
    status: "failed",
    output: null,
    error: {
        type: "mcp_tool_execution_error",
        content: {
            isError: true,
            content: [{ type: "text", text: "Search unavailable" }],
        },
    },
};

const OUTPUT = [
    message("msg_1", "Drawing bees."),
    IMAGE_CALL,
    SEARCH_CALL,
    message("msg_2", "Here they are."),
];

function sse(events: Record<string, unknown>[]) {
    return `${events
        .map(
            (event) =>
                `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
        )
        .join("")}data: [DONE]\n\n`;
}

function textEvents(id: string, deltas: string[]) {
    return [
        {
            type: "response.output_item.added",
            item: { ...message(id, ""), status: "in_progress" },
        },
        ...deltas.map((delta) => ({
            type: "response.output_text.delta",
            item_id: id,
            delta,
        })),
        {
            type: "response.output_item.done",
            item: message(id, deltas.join("")),
        },
    ];
}

function toolEvents(call: typeof IMAGE_CALL | typeof SEARCH_CALL) {
    return [
        {
            type: "response.output_item.added",
            item: { ...call, status: "in_progress", output: null, error: null },
        },
        { type: "response.output_item.done", item: call },
    ];
}

function stubFetch(response: () => Response) {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => response());
    vi.stubGlobal("fetch", fetch);
    return fetch;
}

async function send(abortSignal?: AbortSignal) {
    return pollinationsChatTransport({
        apiKey: "sk_test",
        model: "community/example/agent",
    }).sendMessages({
        trigger: "submit-message",
        chatId: "chat",
        messageId: undefined,
        messages: [USER],
        abortSignal,
    });
}

async function readChunks(stream: ReadableStream<unknown>) {
    const chunks: unknown[] = [];
    const reader = stream.getReader();
    while (true) {
        const { done, value } = await reader.read();
        if (done) return chunks;
        chunks.push(value);
    }
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("responsesInput", () => {
    it("sends user parts and earlier replies' raw output items back unchanged", () => {
        expect(
            responsesInput([
                {
                    id: "user-1",
                    role: "user",
                    parts: [
                        {
                            type: "file",
                            mediaType: "image/png",
                            filename: "photo.png",
                            url: "https://media.example.test/photo.png",
                        },
                        { type: "text", text: "Draw bees like this" },
                    ],
                },
                {
                    id: "reply-1",
                    role: "assistant",
                    metadata: { output: OUTPUT },
                    parts: [{ type: "text", text: "Drawing bees." }],
                },
                USER,
                {
                    id: "stopped-reply",
                    role: "assistant",
                    parts: [{ type: "text", text: "Partial" }],
                },
            ]),
        ).toEqual([
            {
                type: "message",
                role: "user",
                content: [
                    {
                        type: "input_image",
                        image_url: "https://media.example.test/photo.png",
                        detail: "auto",
                    },
                    { type: "input_text", text: "Draw bees like this" },
                ],
            },
            ...OUTPUT,
            {
                type: "message",
                role: "user",
                content: [{ type: "input_text", text: "Draw bees" }],
            },
        ]);
    });
});

describe("pollinationsChatTransport", () => {
    it("streams text, server tools and generated media in order and keeps the raw output", async () => {
        const fetch = stubFetch(
            () =>
                new Response(
                    sse([
                        { type: "response.created", response: { output: [] } },
                        ...textEvents("msg_1", ["Drawing ", "bees."]),
                        ...toolEvents(IMAGE_CALL),
                        ...toolEvents(SEARCH_CALL),
                        ...textEvents("msg_2", ["Here they are."]),
                        {
                            type: "response.completed",
                            response: { output: OUTPUT },
                        },
                    ]),
                ),
        );

        let reply: PollinationsUIMessage | undefined;
        for await (const snapshot of readUIMessageStream<PollinationsUIMessage>(
            { stream: await send() },
        ))
            reply = snapshot;

        const [url, init] = fetch.mock.calls[0];
        expect(url).toBe("https://gen.pollinations.ai/v1/responses");
        expect(init.headers).toMatchObject({
            Authorization: "Bearer sk_test",
        });
        expect(JSON.parse(String(init.body))).toEqual({
            model: "community/example/agent",
            input: responsesInput([USER]),
            stream: true,
            store: false,
        });
        expect(
            reply?.parts.filter((part) => part.type !== "step-start"),
        ).toMatchObject([
            { type: "text", text: "Drawing bees.", state: "done" },
            {
                type: "dynamic-tool",
                toolCallId: "mcp_image",
                toolName: "generateImage",
                state: "output-available",
                input: { prompt: "bees" },
                output: "https://media.example.test/bees.png\nSeed 42",
            },
            {
                type: "file",
                mediaType: "image/png",
                url: "https://media.example.test/bees.png",
            },
            {
                type: "dynamic-tool",
                toolName: "search",
                state: "output-error",
                errorText: "Search unavailable",
            },
            { type: "text", text: "Here they are.", state: "done" },
        ]);
        expect(reply?.metadata).toEqual({ output: OUTPUT });
    });

    it.each([
        [
            "an HTTP error",
            () =>
                new Response(
                    JSON.stringify({
                        error: { message: "Insufficient balance" },
                    }),
                    { status: 402 },
                ),
            "Insufficient balance",
        ],
        [
            "a failed response",
            () =>
                new Response(
                    sse([
                        ...textEvents("msg_1", ["Partial"]),
                        {
                            type: "error",
                            code: "agent_error",
                            message: "Model unavailable",
                        },
                        {
                            type: "response.failed",
                            response: {
                                error: { message: "Model unavailable" },
                            },
                        },
                    ]),
                ),
            "Model unavailable",
        ],
        [
            "a stream that ends early",
            () => new Response(sse(textEvents("msg_1", ["Partial"]))),
            "The response ended early.",
        ],
    ])("fails the reply on %s", async (_case, response, error) => {
        stubFetch(response);
        await expect(readChunks(await send())).rejects.toThrow(error);
    });

    it("marks a stopped reply cancelled while keeping its text", async () => {
        const controller = new AbortController();
        vi.stubGlobal(
            "fetch",
            vi.fn(
                async (_url: string, init: RequestInit) =>
                    new Response(
                        new ReadableStream({
                            start(stream) {
                                stream.enqueue(
                                    new TextEncoder().encode(
                                        sse(textEvents("msg_1", ["Partial"])),
                                    ),
                                );
                                init.signal?.addEventListener("abort", () =>
                                    stream.error(init.signal?.reason),
                                );
                            },
                        }),
                    ),
            ),
        );

        const chunks: { type: string }[] = [];
        const reader = (await send(controller.signal)).getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            if (value.type === "text-delta") controller.abort();
        }
        expect(chunks).toContainEqual(
            expect.objectContaining({ type: "text-delta", delta: "Partial" }),
        );
        expect(chunks).toContainEqual(
            expect.objectContaining({
                type: "data-responseStatus",
                data: { status: "cancelled" },
            }),
        );
        expect(chunks[chunks.length - 1]).toEqual({ type: "abort", reason: "cancelled" });
    });
});
