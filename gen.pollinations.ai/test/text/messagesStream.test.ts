import { describe, expect, it } from "vitest";
import { toAnthropicMessageStream } from "../../src/text/messages/stream.js";

const encoder = new TextEncoder();

function sseStream(chunks: string[]): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({
        start(controller) {
            for (const chunk of chunks) {
                controller.enqueue(encoder.encode(chunk));
            }
            controller.close();
        },
    });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<{
    events: { event?: string; data: Record<string, unknown> }[];
    raw: string;
}> {
    const raw = await new Response(stream).text();
    const events: { event?: string; data: Record<string, unknown> }[] = [];
    for (const block of raw.split("\n\n").filter(Boolean)) {
        const lines = block.split("\n");
        const event = lines
            .find((l) => l.startsWith("event:"))
            ?.slice(6)
            .trim();
        const dataLine = lines.find((l) => l.startsWith("data:"));
        if (dataLine) {
            const body = dataLine.slice(5).trim();
            events.push({
                event,
                data: body.startsWith("{") ? JSON.parse(body) : {},
            });
        }
    }
    return { events, raw };
}

describe("toAnthropicMessageStream", () => {
    it("emits live message_start/text deltas/blocks/message_stop", async () => {
        const upstream = sseStream([
            'data: {"id":"c1","choices":[{"delta":{"content":"He"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"llo"}}]}\n\n',
            'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
            'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":2}}\n\n',
            "data: [DONE]\n\n",
        ]);
        const { events, raw } = await collect(
            toAnthropicMessageStream(upstream, "uuid-1", "openai"),
        );
        const types = events.map((e) => e.data.type);
        expect(types).toEqual([
            "message_start",
            "content_block_start",
            "content_block_delta",
            "content_block_delta",
            "content_block_stop",
            "message_delta",
            "message_stop",
        ]);
        // no SSE buffering: deltas are forwarded as their own events
        expect(raw).toContain('"text_delta","text":"He"');
        expect(
            events.find((e) => e.data.type === "message_delta"),
        ).toMatchObject({
            data: {
                delta: { stop_reason: "end_turn" },
                usage: { input_tokens: 5, output_tokens: 2 },
            },
        });
    });

    it("streams tool_use blocks from tool_call deltas", async () => {
        const upstream = sseStream([
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"get_weather","arguments":""}}]}}]}\n\n',
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"city\\":"}}]}}]}\n\n',
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"Paris\\"}"}}]}}]}\n\n',
            'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
            'data: {"choices":[],"usage":{"prompt_tokens":7,"completion_tokens":4}}\n\n',
            "data: [DONE]\n\n",
        ]);
        const { events } = await collect(
            toAnthropicMessageStream(upstream, "uuid-2", "openai"),
        );
        const start = events.find((e) => e.data.type === "content_block_start");
        expect(start?.data.content_block).toMatchObject({
            type: "tool_use",
            id: "call_1",
            name: "get_weather",
        });
        const deltas = events
            .filter((e) => e.data.type === "content_block_delta")
            .map(
                (e) =>
                    (e.data.delta as Record<string, string>).partial_json ??
                    (e.data.delta as Record<string, string>).thinking,
            )
            .filter(Boolean);
        expect(deltas.join("")).toBe('{"city":"Paris"}');
        expect(
            events.find((e) => e.data.type === "message_delta")?.data,
        ).toMatchObject({
            delta: { stop_reason: "tool_use" },
        });
    });

    it("emits thinking deltas before text deltas", async () => {
        const upstream = sseStream([
            'data: {"choices":[{"delta":{"reasoning_content":"2+2=4"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"4"}}]}\n\n',
            'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
            'data: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":1}}\n\n',
            "data: [DONE]\n\n",
        ]);
        const { events } = await collect(
            toAnthropicMessageStream(upstream, "uuid-3", "openai"),
        );
        expect(
            events.find((e) => e.data.type === "content_block_start")?.data
                .content_block,
        ).toEqual({
            type: "thinking",
            thinking: "",
        });
        const types = events.map((e) => e.data.type);
        expect(types.indexOf("content_block_stop")).toBeLessThan(
            types.lastIndexOf("content_block_start"),
        );
    });

    it("fails with an error event when the stream ends without usage", async () => {
        const upstream = sseStream([
            'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n',
            "data: [DONE]\n\n",
        ]);
        const { events, raw } = await collect(
            toAnthropicMessageStream(upstream, "uuid-4", "openai"),
        );
        expect(events.find((e) => e.event === "error")).toBeTruthy();
        expect(raw).not.toContain("message_stop");
        expect(raw).toContain("usage");
    });
});
