// OpenAI Chat Completions SSE → Anthropic Messages SSE translation.
//
// Event vocabulary follows the Anthropic Messages streaming spec: one
// message_start, content_block_start/delta/stop per content block, a final
// message_delta carrying stop_reason and cumulative usage, message_stop, and
// periodic ping events so long silent reasoning gaps never hit a client idle
// abort (Claude Code disconnects after 300s of silence).
//
// The pipeline already fails streams that omit provider usage: the client
// branch ends with an OpenAI error event instead of [DONE]. That event is
// translated to an Anthropic error event, and the stream ends there without
// message_stop — the streaming counterpart of the JSON path's hard failure.

import type { AnthropicUsage } from "@shared/schemas/anthropic.ts";
import { createParser } from "eventsource-parser";
import { usageToAnthropic } from "./response.js";

const encoder = new TextEncoder();
const PING_INTERVAL_MS = 25_000;

function sse(event: string, data: Record<string, unknown>): Uint8Array {
    return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function emptyUsage(): AnthropicUsage {
    return {
        input_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: 0,
    };
}

function stopReason(
    finish: string | null | undefined,
): "end_turn" | "max_tokens" | "tool_use" | "refusal" {
    switch (finish) {
        case "length":
            return "max_tokens";
        case "tool_calls":
        case "function_call":
            return "tool_use";
        case "content_filter":
            return "refusal";
        default:
            return "end_turn";
    }
}

type OpenBlock = {
    kind: "text" | "thinking" | "tool_use";
    index: number;
};

/**
 * Translates the client branch of a Chat Completions SSE stream into the
 * Anthropic Messages event sequence. Billing stays on the pipeline's own
 * tracking branch (the tee already done by handleChatCompletionLocal), so
 * this stream is purely client presentation.
 */
export function chatStreamToAnthropicEvents(
    body: ReadableStream<Uint8Array>,
    metadata: { id: string; model: string },
): ReadableStream<Uint8Array> {
    const decoder = new TextDecoder();
    const openBlocks = new Map<number, OpenBlock>();
    const toolCallBlock = new Map<number, number>();

    let nextIndex = 0;
    let messageStartEmitted = false;
    let errorEmitted = false;
    let failedEvent: Uint8Array | undefined;
    let finishReason: string | null | undefined;
    let usage: AnthropicUsage | undefined;

    const message = () => ({
        id: metadata.id,
        type: "message" as const,
        role: "assistant" as const,
        model: metadata.model,
        content: [] as [],
        stop_reason: null,
        stop_sequence: null,
        usage: emptyUsage(),
    });

    // Events enqueued before the stream starts are buffered here and flushed
    // by start(); afterwards enqueue points at the controller directly.
    const pending: Uint8Array[] = [];
    let liveController:
        | TransformStreamDefaultController<Uint8Array>
        | undefined;
    const enqueue = (chunk: Uint8Array) =>
        liveController ? liveController.enqueue(chunk) : pending.push(chunk);

    function emitMessageStart() {
        if (messageStartEmitted) return;
        messageStartEmitted = true;
        enqueue(
            sse("message_start", { type: "message_start", message: message() }),
        );
    }

    function startBlock(
        block: OpenBlock,
        contentBlock: Record<string, unknown>,
    ) {
        openBlocks.set(block.index, block);
        enqueue(
            sse("content_block_start", {
                type: "content_block_start",
                index: block.index,
                content_block: contentBlock,
            }),
        );
    }

    function blockFor(kind: "text" | "thinking"): OpenBlock {
        const existing = [...openBlocks.values()].find((b) => b.kind === kind);
        if (existing) return existing;
        const block = { kind, index: nextIndex++ };
        startBlock(
            block,
            kind === "text"
                ? { type: "text", text: "" }
                : { type: "thinking", thinking: "" },
        );
        return block;
    }

    const parser = createParser({
        onEvent(sseMessage) {
            if (failedEvent) return;
            if (sseMessage.data.trim() === "[DONE]") return;
            let event: unknown;
            try {
                event = JSON.parse(sseMessage.data);
            } catch {
                return;
            }
            if (!event || typeof event !== "object") return;
            const chunk = event as {
                usage?: unknown;
                error?: unknown;
                choices?: {
                    delta?: Record<string, unknown>;
                    finish_reason?: string | null;
                }[];
            };

            // The pipeline appends this event instead of [DONE] when the
            // provider omitted usage. Translate it and terminate.
            if (chunk.error && typeof chunk.error === "object") {
                const { message, type } = chunk.error as {
                    message?: unknown;
                    type?: unknown;
                };
                failedEvent = sse("error", {
                    type: "error",
                    error: {
                        type: "api_error",
                        message:
                            typeof message === "string"
                                ? message
                                : "Upstream provider failed before reporting usage",
                        ...(typeof type === "string" && {
                            upstream_type: type,
                        }),
                    },
                });
                return;
            }

            if (chunk.usage && typeof chunk.usage === "object") {
                // Providers may send provisional counts; the last one is final.
                usage = usageToAnthropic(
                    chunk.usage as Record<string, unknown>,
                );
            }

            const delta = chunk.choices?.[0]?.delta;
            if (chunk.choices?.[0]?.finish_reason) {
                finishReason = chunk.choices[0].finish_reason;
            }
            if (!delta) return;

            emitMessageStart();

            const reasoning = delta.reasoning_content ?? delta.reasoning;
            if (typeof reasoning === "string" && reasoning.length > 0) {
                const block = blockFor("thinking");
                enqueue(
                    sse("content_block_delta", {
                        type: "content_block_delta",
                        index: block.index,
                        delta: { type: "thinking_delta", thinking: reasoning },
                    }),
                );
            }

            if (typeof delta.content === "string" && delta.content.length > 0) {
                const block = blockFor("text");
                enqueue(
                    sse("content_block_delta", {
                        type: "content_block_delta",
                        index: block.index,
                        delta: { type: "text_delta", text: delta.content },
                    }),
                );
            }

            if (Array.isArray(delta.tool_calls)) {
                for (const call of delta.tool_calls) {
                    toolDelta(
                        call as {
                            index?: number;
                            id?: unknown;
                            function?: { name?: unknown; arguments?: unknown };
                        },
                    );
                }
            }
        },
    });

    function toolDelta(call: {
        index?: number;
        id?: unknown;
        function?: { name?: unknown; arguments?: unknown };
    }) {
        const callIndex = call.index ?? 0;
        let blockIndex = toolCallBlock.get(callIndex);
        if (blockIndex === undefined) {
            const info = {
                id: typeof call.id === "string" ? call.id : "",
                name:
                    typeof call.function?.name === "string"
                        ? call.function.name
                        : "",
            };
            blockIndex = nextIndex++;
            toolCallBlock.set(callIndex, blockIndex);
            startBlock(
                { kind: "tool_use", index: blockIndex },
                { type: "tool_use", id: info.id, name: info.name, input: {} },
            );
        }
        const partial = call.function?.arguments;
        if (typeof partial === "string" && partial.length > 0) {
            enqueue(
                sse("content_block_delta", {
                    type: "content_block_delta",
                    index: blockIndex,
                    delta: { type: "input_json_delta", partial_json: partial },
                }),
            );
        }
    }

    let stopPings = () => {};

    return body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
            start(controller) {
                liveController = controller;
                for (const queued of pending.splice(0)) {
                    controller.enqueue(queued);
                }
                // Keepalives for silent reasoning gaps; cleared on every exit.
                const timer = setInterval(() => {
                    try {
                        controller.enqueue(sse("ping", { type: "ping" }));
                    } catch {
                        stopPings();
                    }
                }, PING_INTERVAL_MS);
                stopPings = () => clearInterval(timer);
            },
            transform(chunk, controller) {
                parser.feed(decoder.decode(chunk, { stream: true }));
                if (failedEvent && !errorEmitted) {
                    errorEmitted = true;
                    stopPings();
                    controller.enqueue(failedEvent);
                }
            },
            flush(controller) {
                parser.feed(`${decoder.decode()}\n\n`);
                parser.reset({ consume: true });
                stopPings();
                if (failedEvent) {
                    if (!errorEmitted) controller.enqueue(failedEvent);
                    return;
                }
                // The pipeline guarantees an error event whenever usage is
                // missing, but never fabricate zero usage if both are absent.
                if (!usage) {
                    controller.enqueue(
                        sse("error", {
                            type: "error",
                            error: {
                                type: "api_error",
                                message:
                                    "Upstream provider ended without terminal usage",
                            },
                        }),
                    );
                    return;
                }
                emitMessageStart();
                for (const [index] of [...openBlocks].sort(
                    (a, b) => a[0] - b[0],
                )) {
                    controller.enqueue(
                        sse("content_block_stop", {
                            type: "content_block_stop",
                            index,
                        }),
                    );
                }
                controller.enqueue(
                    sse("message_delta", {
                        type: "message_delta",
                        delta: {
                            stop_reason: stopReason(finishReason),
                            stop_sequence: null,
                        },
                        usage: usage ?? emptyUsage(),
                    }),
                );
                controller.enqueue(
                    sse("message_stop", { type: "message_stop" }),
                );
            },
            cancel() {
                stopPings();
            },
        }),
    );
}
