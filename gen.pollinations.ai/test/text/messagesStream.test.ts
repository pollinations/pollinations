import { describe, expect, it } from "vitest";
import {
    chatStreamToMessagesStream,
    MESSAGES_PING_INTERVAL_MS,
} from "@/text/messages/stream.ts";

type CollectedEvent = { event: string; data: unknown };

function openAIStream(
    payloads: (Record<string, unknown> | "[DONE]")[],
    holdOpenMs = 0,
): ReadableStream<Uint8Array<ArrayBuffer>> {
    const encoder = new TextEncoder();
    return new ReadableStream<Uint8Array<ArrayBuffer>>({
        async start(controller) {
            for (const payload of payloads) {
                controller.enqueue(
                    encoder.encode(
                        `data: ${payload === "[DONE]" ? "[DONE]" : JSON.stringify(payload)}\n\n`,
                    ),
                );
            }
            if (holdOpenMs > 0) {
                await new Promise((resolve) => setTimeout(resolve, holdOpenMs));
            }
            controller.close();
        },
    });
}

async function collect(
    source: ReadableStream<Uint8Array<ArrayBuffer>>,
): Promise<CollectedEvent[]> {
    const reader = source.getReader();
    const decoder = new TextDecoder();
    let text = "";
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const events: CollectedEvent[] = [];
    for (const frame of text.split("\n\n")) {
        if (!frame.trim()) continue;
        const eventLine = frame.split("\n").find((line) => line.startsWith("event:"));
        const dataLine = frame.split("\n").find((line) => line.startsWith("data:"));
        if (!eventLine || !dataLine) continue;
        events.push({
            event: eventLine.slice("event:".length).trim(),
            data: JSON.parse(dataLine.slice("data:".length).trim()),
        });
    }
    return events;
}

function chunk(
    delta: Record<string, unknown>,
    extra: Record<string, unknown> = {},
): Record<string, unknown> {
    return {
        id: "chatcmpl-1",
        object: "chat.completion.chunk",
        created: 1,
        model: "openai",
        choices: [{ index: 0, delta, finish_reason: null }],
        ...extra,
    };
}

const doneUsage = {
    prompt_tokens: 50,
    completion_tokens: 12,
    total_tokens: 62,
};

describe("chatStreamToMessagesStream", () => {
    it("emits the standard event order for streamed text", async () => {
        const events = await collect(
            chatStreamToMessagesStream(
                openAIStream([
                    chunk({ role: "assistant", content: "Hel" }),
                    chunk({ content: "lo" }, { usage: doneUsage }),
                    "[DONE]",
                ]),
                { model: "openai", messageId: "msg_test" },
            ),
        );
        expect(events.map((entry) => entry.event)).toEqual([
            "message_start",
            "content_block_start",
            "content_block_delta",
            "content_block_delta",
            "content_block_stop",
            "message_delta",
            "message_stop",
        ]);
        expect(events[0].data).toMatchObject({
            type: "message_start",
            message: { id: "msg_test", role: "assistant", model: "openai" },
        });
        expect(events[1].data).toMatchObject({
            type: "content_block_start",
            index: 0,
            content_block: { type: "text" },
        });
        expect(events[2].data).toMatchObject({
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: "Hel" },
        });
        expect(events[5].data).toMatchObject({
            type: "message_delta",
            delta: { stop_reason: "end_turn", stop_sequence: null },
            usage: { input_tokens: 50, output_tokens: 12 },
        });
    });

    it("streams thinking before text on separate blocks", async () => {
        const events = await collect(
            chatStreamToMessagesStream(
                openAIStream([
                    chunk({ reasoning_content: "hmm" }),
                    chunk({ content: "answer" }, { usage: doneUsage }),
                    "[DONE]",
                ]),
                { model: "openai" },
            ),
        );
        const starts = events.filter(
            (entry) => entry.event === "content_block_start",
        );
        expect(starts.map((entry) => (entry.data as { index: number }).index)).toEqual([
            0, 1,
        ]);
        expect(starts[0].data).toMatchObject({
            content_block: { type: "thinking" },
        });
        expect(starts[1].data).toMatchObject({
            content_block: { type: "text" },
        });
        expect(
            events.find(
                (entry) =>
                    entry.event === "content_block_delta" &&
                    (entry.data as { delta: { type: string } }).delta.type ===
                        "thinking_delta",
            ),
        ).toBeDefined();
    });

    it("accumulates tool_call argument fragments into input_json_delta", async () => {
        const events = await collect(
            chatStreamToMessagesStream(
                openAIStream([
                    chunk({
                        tool_calls: [
                            {
                                index: 0,
                                id: "call_1",
                                function: {
                                    name: "get_weather",
                                    arguments: '{"city":',
                                },
                            },
                        ],
                    }),
                    chunk(
                        {
                            tool_calls: [
                                {
                                    index: 0,
                                    function: { arguments: '"Paris"}' },
                                },
                            ],
                        },
                        { usage: doneUsage },
                    ),
                    {
                        ...chunk({}, { usage: doneUsage }),
                        choices: [
                            { index: 0, delta: {}, finish_reason: "tool_calls" },
                        ],
                    },
                    "[DONE]",
                ]),
                { model: "openai" },
            ),
        );
        const starts = events.filter(
            (entry) => entry.event === "content_block_start",
        );
        expect(starts).toHaveLength(1);
        expect(starts[0].data).toMatchObject({
            content_block: {
                type: "tool_use",
                id: "call_1",
                name: "get_weather",
            },
        });
        const deltas = events.filter(
            (entry) => entry.event === "content_block_delta",
        );
        expect(
            deltas
                .map(
                    (entry) =>
                        (entry.data as { delta: { partial_json?: string } })
                            .delta.partial_json,
                )
                .join(""),
        ).toBe('{"city":"Paris"}');
        expect(events.at(-2)?.data).toMatchObject({
            type: "message_delta",
            delta: { stop_reason: "tool_use" },
        });
    });

    it("ends with an error event instead of message_stop when usage is missing", async () => {
        const events = await collect(
            chatStreamToMessagesStream(
                openAIStream([chunk({ content: "half" }), "[DONE]"]),
                { model: "openai" },
            ),
        );
        const types = events.map((entry) => entry.event);
        expect(types).toContain("error");
        expect(types).not.toContain("message_stop");
        expect(types).not.toContain("message_delta");
        expect(events.at(-1)?.data).toMatchObject({
            type: "error",
            error: { type: "api_error" },
        });
    });

    it("maps an upstream error chunk to an Anthropic error event", async () => {
        const events = await collect(
            chatStreamToMessagesStream(
                openAIStream([
                    {
                        error: {
                            message: "provider blew up",
                            type: "upstream_error",
                            code: "usage_missing",
                        },
                    },
                ]),
                { model: "openai" },
            ),
        );
        expect(events.map((entry) => entry.event)).toEqual(["error"]);
        expect(events[0].data).toMatchObject({
            type: "error",
            error: { type: "api_error", message: "provider blew up" },
        });
    });

    it("completes when the provider closes without [DONE] but with usage", async () => {
        const events = await collect(
            chatStreamToMessagesStream(
                openAIStream([chunk({ content: "yo" }, { usage: doneUsage })]),
                { model: "openai" },
            ),
        );
        expect(events.map((entry) => entry.event).at(-1)).toBe("message_stop");
    });

    it("emits pings while the upstream goes quiet", async () => {
        // Upstream quiet BETWEEN chunks (not after terminal [DONE]):
        // enqueue text, stall 80ms (>2x 15ms ping interval), then DONE.
        const encoder = new TextEncoder();
        const slowUpstream = new ReadableStream<Uint8Array<ArrayBuffer>>({
            async start(controller) {
                controller.enqueue(
                    encoder.encode(
                        `data: ${JSON.stringify(chunk({ content: "slow" }, { usage: doneUsage }))}\n\n`,
                    ),
                );
                await new Promise((resolve) => setTimeout(resolve, 80));
                controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                controller.close();
            },
        });
        const events = await collect(
            chatStreamToMessagesStream(slowUpstream, {
                model: "openai",
                pingIntervalMs: 15,
            }),
        );
        expect(
            events.some((entry) => entry.event === "ping"),
        ).toBe(true);
        expect(events.map((entry) => entry.event).at(-1)).toBe("message_stop");
    });

    it("uses a 15s default ping interval, well under the 300s abort", () => {
        expect(MESSAGES_PING_INTERVAL_MS).toBe(15_000);
        expect(MESSAGES_PING_INTERVAL_MS).toBeLessThan(300_000);
    });
});
