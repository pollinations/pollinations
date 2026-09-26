import { describe, expect, it } from "vitest";
import { toSseEvent } from "../../src/text/anthropic/events.ts";
import {
    createAnthropicStreamState,
    finishAnthropicStream,
    KEEPALIVE_INTERVAL_MS,
    mapChatChunkToAnthropicEvents,
} from "../../src/text/anthropic/stream.ts";

const chunk = (delta: Record<string, unknown>, finish?: string) => ({
    id: "chatcmpl-1",
    model: "openai",
    choices: [{ index: 0, delta, finish_reason: finish ?? null }],
});

describe("anthropic stream event mapping", () => {
    it("emits message_start before the first delta", () => {
        const state = createAnthropicStreamState({
            messageId: "msg_1",
            model: "openai",
        });
        const events = mapChatChunkToAnthropicEvents(
            state,
            chunk({ content: "Hi" }),
        );
        expect(events[0].type).toBe("message_start");
        expect(events[1].type).toBe("content_block_start");
        expect(events[2]).toMatchObject({
            type: "content_block_delta",
            delta: { type: "text_delta", text: "Hi" },
        });
    });

    it("shapes reasoning deltas as thinking blocks", () => {
        const state = createAnthropicStreamState({
            messageId: "msg_2",
            model: "openai",
        });
        const events = mapChatChunkToAnthropicEvents(
            state,
            chunk({ reasoning_content: "hmm" }),
        );
        const start = events.find((e) => e.type === "content_block_start");
        const delta = events.find((e) => e.type === "content_block_delta");
        expect(start).toMatchObject({
            content_block: { type: "thinking" },
        });
        expect(delta).toMatchObject({
            delta: { type: "thinking_delta", thinking: "hmm" },
        });
    });

    it("opens a tool_use block and streams input_json_delta", () => {
        const state = createAnthropicStreamState({
            messageId: "msg_3",
            model: "openai",
        });
        const events = mapChatChunkToAnthropicEvents(
            state,
            chunk({
                tool_calls: [
                    {
                        index: 0,
                        id: "toolu_9",
                        function: { name: "read_file", arguments: '{"pa' },
                    },
                ],
            }),
        );
        const start = events.find((e) => e.type === "content_block_start");
        expect(start).toMatchObject({
            content_block: {
                type: "tool_use",
                id: "toolu_9",
                name: "read_file",
            },
        });
        const delta = events.find((e) => e.type === "content_block_delta");
        expect(delta).toMatchObject({
            delta: { type: "input_json_delta", partial_json: '{"pa' },
        });
    });

    it("orders events with increasing sequence numbers and closes blocks then stops", () => {
        const state = createAnthropicStreamState({
            messageId: "msg_4",
            model: "openai",
        });
        const events = [
            ...mapChatChunkToAnthropicEvents(state, chunk({ content: "a" })),
            ...mapChatChunkToAnthropicEvents(
                state,
                chunk({ content: "b" }, "stop"),
            ),
            ...finishAnthropicStream(state),
        ];
        const sequences = events.map(
            (e) => (e as { sequence_number: number }).sequence_number,
        );
        expect(sequences).toEqual([...sequences].sort((x, y) => x - y));
        expect(events.at(-1)?.type).toBe("message_stop");
        expect(events.at(-2)?.type).toBe("message_delta");
    });

    it("keeps a documented keepalive under Claude Code's 300s abort", () => {
        expect(KEEPALIVE_INTERVAL_MS).toBeLessThan(300_000);
    });

    it("encodes named SSE frames", () => {
        const frame = toSseEvent({ type: "ping", sequence_number: 0 });
        expect(frame).toBe(
            'event: ping\ndata: {"type":"ping","sequence_number":0}\n\n',
        );
    });
});
