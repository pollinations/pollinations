import { describe, expect, it } from "vitest";
import { toAnthropicMessageStream } from "../../src/text/messages/stream.js";

function openAIStream(events: unknown[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream({
        start(controller) {
            for (const event of events) {
                const data =
                    event === "[DONE]" ? "[DONE]" : JSON.stringify(event);
                controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }
            controller.close();
        },
    });
}

async function anthropicEvents(stream: ReadableStream<Uint8Array>) {
    const text = await new Response(stream).text();
    return text
        .split("\n\n")
        .filter((block) => block.trim().length > 0)
        .map((block) => {
            const [eventLine, dataLine] = block.split("\n");
            return {
                event: eventLine.replace("event: ", ""),
                data: JSON.parse(dataLine.replace("data: ", "")),
            };
        });
}

function chunk(
    delta: Record<string, unknown>,
    finishReason: string | null = null,
) {
    return {
        id: "pllns_stream1",
        object: "chat.completion.chunk",
        model: "openai/gpt-5.4-nano",
        choices: [{ index: 0, delta, finish_reason: finishReason }],
    };
}

function usageChunk(usage: Record<string, unknown>) {
    return {
        id: "pllns_stream1",
        object: "chat.completion.chunk",
        choices: [],
        usage,
    };
}

describe("Chat Completions stream -> Anthropic Messages stream", () => {
    it("streams text deltas and closes with usage", async () => {
        const events = await anthropicEvents(
            toAnthropicMessageStream(
                openAIStream([
                    chunk({ role: "assistant", content: "" }),
                    chunk({ content: "Hel" }),
                    chunk({ content: "lo!" }, "stop"),
                    usageChunk({
                        prompt_tokens: 10,
                        completion_tokens: 3,
                        total_tokens: 13,
                    }),
                    "[DONE]",
                ]),
                "openai/gpt-5.4-nano",
            ),
        );

        expect(events.map((e) => e.event)).toEqual([
            "message_start",
            "content_block_start",
            "content_block_delta",
            "content_block_delta",
            "content_block_stop",
            "message_delta",
            "message_stop",
        ]);
        expect(events[0].data.message.id).toBe("msg_stream1");
        expect(events[1].data.content_block).toEqual({
            type: "text",
            text: "",
        });
        expect(events[2].data.delta).toEqual({
            type: "text_delta",
            text: "Hel",
        });
        expect(events[3].data.delta).toEqual({
            type: "text_delta",
            text: "lo!",
        });
        expect(events[5].data).toEqual({
            type: "message_delta",
            delta: { stop_reason: "end_turn", stop_sequence: null },
            usage: { input_tokens: 10, output_tokens: 3 },
        });
    });

    it("streams thinking before text as separate content blocks", async () => {
        const events = await anthropicEvents(
            toAnthropicMessageStream(
                openAIStream([
                    chunk({ reasoning_content: "Let me think" }),
                    chunk({ content: "42" }, "stop"),
                    usageChunk({
                        prompt_tokens: 5,
                        completion_tokens: 2,
                        total_tokens: 7,
                    }),
                ]),
                "m",
            ),
        );

        const starts = events.filter((e) => e.event === "content_block_start");
        expect(starts[0].data.content_block).toEqual({
            type: "thinking",
            thinking: "",
        });
        expect(starts[1].data.content_block).toEqual({
            type: "text",
            text: "",
        });
        expect(starts[0].data.index).toBe(0);
        expect(starts[1].data.index).toBe(1);

        const deltas = events.filter((e) => e.event === "content_block_delta");
        expect(deltas[0].data.delta).toEqual({
            type: "thinking_delta",
            thinking: "Let me think",
        });
        expect(deltas[1].data.delta).toEqual({
            type: "text_delta",
            text: "42",
        });
    });

    it("streams incremental tool call arguments as input_json_delta", async () => {
        const events = await anthropicEvents(
            toAnthropicMessageStream(
                openAIStream([
                    chunk({
                        tool_calls: [
                            {
                                index: 0,
                                id: "toolu_1",
                                function: {
                                    name: "get_weather",
                                    arguments: "",
                                },
                            },
                        ],
                    }),
                    chunk({
                        tool_calls: [
                            { index: 0, function: { arguments: '{"city":' } },
                        ],
                    }),
                    chunk(
                        {
                            tool_calls: [
                                {
                                    index: 0,
                                    function: { arguments: '"Rome"}' },
                                },
                            ],
                        },
                        "tool_calls",
                    ),
                    usageChunk({
                        prompt_tokens: 5,
                        completion_tokens: 2,
                        total_tokens: 7,
                    }),
                ]),
                "m",
            ),
        );

        const start = events.find((e) => e.event === "content_block_start");
        expect(start?.data.content_block).toEqual({
            type: "tool_use",
            id: "toolu_1",
            name: "get_weather",
            input: {},
        });

        const partials = events
            .filter((e) => e.event === "content_block_delta")
            .map((e) => e.data.delta.partial_json);
        expect(partials.join("")).toBe('{"city":"Rome"}');

        const messageDelta = events.find((e) => e.event === "message_delta");
        expect(messageDelta?.data.delta.stop_reason).toBe("tool_use");
    });

    it("ends with an error event instead of message_stop when usage is missing", async () => {
        const events = await anthropicEvents(
            toAnthropicMessageStream(
                openAIStream([
                    chunk({ content: "partial" }),
                    {
                        error: {
                            message:
                                "Chat Completions provider ended without terminal usage",
                            type: "upstream_error",
                            code: "usage_missing",
                        },
                    },
                ]),
                "m",
            ),
        );

        expect(events.at(-1)?.event).toBe("error");
        expect(events.at(-1)?.data).toEqual({
            type: "error",
            error: {
                type: "api_error",
                message:
                    "Chat Completions provider ended without terminal usage",
            },
        });
        expect(events.some((e) => e.event === "message_stop")).toBe(false);
    });
});
