import { describe, expect, it, vi } from "vitest";
import {
    createResponsesChatTransport,
    responsesSseToUiMessageStream,
    type UiMessage,
    uiMessagesToResponsesInput,
} from "./responses-chat-transport.js";

function uiMessage(role: "user" | "assistant", text: string): UiMessage {
    return {
        id: `${role}-1`,
        role,
        parts: [{ type: "text", text }],
    };
}

describe("uiMessagesToResponsesInput", () => {
    it("maps text parts to Responses input_text items", () => {
        const input = uiMessagesToResponsesInput([
            uiMessage("user", "hello"),
            uiMessage("assistant", "hi there"),
        ]);
        expect(input).toEqual([
            {
                role: "user",
                content: [{ type: "input_text", text: "hello" }],
            },
            {
                role: "assistant",
                content: [{ type: "input_text", text: "hi there" }],
            },
        ]);
    });

    it("skips messages without text", () => {
        const input = uiMessagesToResponsesInput([
            { id: "x", role: "user", parts: [] },
        ]);
        expect(input).toEqual([]);
    });
});

async function collect(stream: ReadableStream<unknown>) {
    const reader = stream.getReader();
    const out: unknown[] = [];
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        out.push(value);
    }
    return out;
}

function sseSource(lines: string[]): ReadableStream<Uint8Array> {
    const body = lines.join("\n");
    return new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(new TextEncoder().encode(body));
            controller.close();
        },
    });
}

describe("responsesSseToUiMessageStream", () => {
    it("emits text-start, deltas, text-end, usage metadata and finish", async () => {
        const chunks = await collect(
            responsesSseToUiMessageStream(
                sseSource([
                    'data: {"type":"response.output_text.delta","delta":"Hel"}',
                    'data: {"type":"response.output_text.delta","delta":"lo"}',
                    'data: {"type":"response.completed","response":{"usage":{"input_tokens":3,"output_tokens":2}}}',
                    "",
                ]),
            ),
        );
        const types = chunks.map((c) => (c as { type: string }).type);
        expect(types).toEqual([
            "text-start",
            "text-delta",
            "text-delta",
            "text-end",
            "message-metadata",
            "finish",
        ]);
        expect(chunks[1]).toMatchObject({ type: "text-delta", delta: "Hel" });
        expect(chunks[4]).toMatchObject({
            type: "message-metadata",
            messageMetadata: {
                usage: { input_tokens: 3, output_tokens: 2 },
            },
        });
    });

    it("emits an error chunk when the run fails", async () => {
        const chunks = await collect(
            responsesSseToUiMessageStream(
                sseSource([
                    'data: {"type":"response.failed","error":{"message":"boom"}}',
                    "",
                ]),
            ),
        );
        expect(chunks[0]).toMatchObject({ type: "error" });
    });
});

describe("responsesSseToUiMessageStream tools", () => {
    it("announces server tool calls as dynamic tool parts", async () => {
        const chunks = await collect(
            responsesSseToUiMessageStream(
                sseSource([
                    'data: {"type":"response.output_text.delta","delta":"Hi"}',
                    'data: {"type":"response.output_item.added","item":{"type":"function_call","id":"call_1","name":"get_weather","arguments":"{\\"city\\":\\"Jakarta\\"}"}}',
                    'data: {"type":"response.completed","response":{"usage":{"input_tokens":3,"output_tokens":2}}}',
                    "",
                ]),
            ),
        );
        const types = chunks.map((c) => (c as { type: string }).type);
        expect(types).toEqual([
            "text-start",
            "text-delta",
            "text-end",
            "tool-input-available",
            "message-metadata",
            "finish",
        ]);
        expect(chunks[3]).toMatchObject({
            type: "tool-input-available",
            toolCallId: "call_1",
            toolName: "get_weather",
            input: { city: "Jakarta" },
            dynamic: true,
        });
    });

    it("emits mcp results and errors", async () => {
        const chunks = await collect(
            responsesSseToUiMessageStream(
                sseSource([
                    'data: {"type":"response.output_item.done","item":{"type":"mcp_call","id":"mcp_1","name":"search","output":"{\\"ok\\":true}"}}',
                    'data: {"type":"response.output_item.done","item":{"type":"mcp_call","id":"mcp_2","name":"search","status":"failed","error":{"message":"boom"}}}',
                    "",
                ]),
            ),
        );
        expect(chunks[0]).toMatchObject({
            type: "tool-output-available",
            toolCallId: "mcp_1",
            output: { ok: true },
        });
        expect(chunks[1]).toMatchObject({
            type: "tool-output-error",
            toolCallId: "mcp_2",
            errorText: "boom",
        });
        expect(chunks[chunks.length - 1]).toMatchObject({ type: "finish" });
    });
});

describe("createResponsesChatTransport", () => {
    it("posts input with the resolved key and converts the stream", async () => {
        const fetchMock = vi.fn(async () => ({
            ok: true,
            body: sseSource([
                'data: {"type":"response.output_text.delta","delta":"hi"}',
                'data: {"type":"response.completed","response":{}}',
                "",
            ]),
        }));
        const transport = createResponsesChatTransport({
            apiKey: () => Promise.resolve("sk_rotated"),
            model: "openai",
            fetch: fetchMock as unknown as typeof fetch,
        });
        const stream = await transport.sendMessages({
            trigger: "submit-message",
            chatId: "c1",
            messageId: undefined,
            messages: [uiMessage("user", "hello")],
            abortSignal: undefined,
        });
        const chunks = await collect(stream);
        expect(fetchMock).toHaveBeenCalledOnce();
        const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect((init.headers as Record<string, string>).Authorization).toBe(
            "Bearer sk_rotated",
        );
        const sent = JSON.parse(init.body as string) as {
            model: string;
            input: unknown[];
        };
        expect(sent.model).toBe("openai");
        expect(sent.input).toHaveLength(1);
        expect(chunks.map((c) => (c as { type: string }).type)).toContain(
            "text-delta",
        );
    });
});
