// Chat Completions SSE -> Anthropic Messages SSE.
//
// The upstream chat pipeline streams OpenAI-shaped deltas. Anthropic clients
// (Claude Code, the SDKs) expect the Messages event order:
//   message_start -> content_block_start/delta/stop (per block)
//   -> message_delta -> message_stop
//
// Two requirements the existing Responses stream does not meet and this one
// must: events are flushed as they arrive (never buffered to the end), and a
// long silent reasoning stretch is bridged with `ping` keepalive events so
// Claude Code's 300-second no-bytes abort never fires.

import type {
    AnthropicContentBlock,
    AnthropicUsage,
} from "@shared/schemas/anthropic.ts";
import { type AnthropicStreamEvent, toSseEvent } from "./events.ts";

/**
 * Idle threshold before a keepalive ping is emitted. Claude Code aborts a
 * stream after 300s without bytes; a ping well under that keeps it alive
 * through long provider reasoning without flooding healthy streams.
 */
export const KEEPALIVE_INTERVAL_MS = 30_000;

interface StreamState {
    sequence: number;
    messageId: string;
    model: string;
    started: boolean;
    /** index of the currently open content block, or null. */
    openIndex: number | null;
    /** type of the currently open block, for delta shaping. */
    openType: "text" | "thinking" | "tool_use" | null;
    toolIndex: number;
    usage: AnthropicUsage;
    stopReason: string | null;
    /** whether any upstream chunk carried provider usage. */
    sawUsage: boolean;
    /** tool-call indexes already opened as content blocks. */
    startedToolIds: Set<number>;
}

const nextSequence = (state: StreamState) => state.sequence++;

const baseUsage = (): AnthropicUsage => ({
    input_tokens: 0,
    output_tokens: 0,
});

/** Map an OpenAI finish_reason to Anthropic's vocabulary. */
const mapStopReason = (reason: unknown): string | null => {
    switch (reason) {
        case "stop":
            return "end_turn";
        case "length":
            return "max_tokens";
        case "tool_calls":
        case "function_call":
            return "tool_use";
        case "content_filter":
            return "refusal";
        default:
            return reason ? String(reason) : null;
    }
};

const openBlock = (
    state: StreamState,
    type: "text" | "thinking" | "tool_use",
    block: AnthropicContentBlock,
): AnthropicStreamEvent[] => {
    const events: AnthropicStreamEvent[] = [];
    if (state.openIndex !== null) {
        events.push({
            type: "content_block_stop",
            index: state.openIndex,
            sequence_number: nextSequence(state),
        });
    }
    state.openIndex = state.toolIndex++;
    state.openType = type;
    events.push({
        type: "content_block_start",
        index: state.openIndex,
        content_block: block,
        sequence_number: nextSequence(state),
    });
    return events;
};

/** Shapes a text-ish delta for the currently open block type. */
const deltaFor = (state: StreamState, text: string): AnthropicStreamEvent => {
    if (state.openType === "thinking") {
        return {
            type: "content_block_delta",
            index: state.openIndex ?? 0,
            delta: { type: "thinking_delta", thinking: text },
            sequence_number: nextSequence(state),
        };
    }
    return {
        type: "content_block_delta",
        index: state.openIndex ?? 0,
        delta: { type: "text_delta", text },
        sequence_number: nextSequence(state),
    };
};

/** Chat SSE chunk -> zero or more Anthropic stream events (pure, testable). */
export function mapChatChunkToAnthropicEvents(
    state: StreamState,
    chunk: Record<string, unknown>,
): AnthropicStreamEvent[] {
    const events: AnthropicStreamEvent[] = [];
    const choices = chunk.choices as Array<Record<string, unknown>> | undefined;
    const choice = choices?.[0];
    const delta = (choice?.delta ?? {}) as Record<string, unknown>;

    if (!state.started) {
        state.started = true;
        events.push({
            type: "message_start",
            message: {
                id: state.messageId,
                type: "message",
                role: "assistant",
                model: state.model,
                content: [],
                stop_reason: null,
                stop_sequence: null,
                usage: baseUsage(),
            },
            sequence_number: nextSequence(state),
        });
    }

    const reasoning =
        (delta.reasoning_content as string | undefined) ??
        (delta.reasoning as string | undefined);
    if (reasoning) {
        if (state.openType !== "thinking") {
            events.push(
                ...openBlock(state, "thinking", {
                    type: "thinking",
                    thinking: "",
                }),
            );
        }
        events.push(deltaFor(state, reasoning));
    }

    const text = delta.content;
    if (typeof text === "string" && text.length > 0) {
        if (state.openType !== "text") {
            events.push(
                ...openBlock(state, "text", { type: "text", text: "" }),
            );
        }
        events.push(deltaFor(state, text));
    }

    const toolCalls = (delta.tool_calls ?? []) as Array<{
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
    }>;
    for (const call of toolCalls) {
        const blockIndex = call.index ?? 0;
        // Open a fresh tool block the first time we see this index.
        if (!state.startedToolIds.has(blockIndex)) {
            state.startedToolIds.add(blockIndex);
            if (state.openIndex !== null) {
                events.push({
                    type: "content_block_stop",
                    index: state.openIndex,
                    sequence_number: nextSequence(state),
                });
            }
            state.openIndex = state.toolIndex++;
            state.openType = "tool_use";
            events.push({
                type: "content_block_start",
                index: state.openIndex,
                content_block: {
                    type: "tool_use",
                    id: call.id ?? `toolu_${blockIndex}`,
                    name: call.function?.name ?? "tool",
                    input: {},
                },
                sequence_number: nextSequence(state),
            });
        }
        if (call.function?.arguments) {
            events.push({
                type: "content_block_delta",
                index: state.openIndex ?? 0,
                delta: {
                    type: "input_json_delta",
                    partial_json: call.function.arguments,
                },
                sequence_number: nextSequence(state),
            });
        }
    }

    if (choice?.finish_reason) {
        state.stopReason = mapStopReason(choice.finish_reason);
    }

    const usage = chunk.usage as Record<string, unknown> | undefined;
    if (usage) {
        state.sawUsage = true;
        const details = (usage.prompt_tokens_details ?? {}) as Record<
            string,
            unknown
        >;
        const prompt = Number(usage.prompt_tokens ?? 0);
        const cacheRead = Number(details.cached_tokens ?? 0) || 0;
        const cacheWrite = Number(details.cache_write_tokens ?? 0) || 0;
        state.usage = {
            input_tokens: Math.max(0, prompt - cacheRead - cacheWrite),
            output_tokens: Number(usage.completion_tokens ?? 0),
            ...(cacheRead ? { cache_read_input_tokens: cacheRead } : {}),
            ...(cacheWrite ? { cache_creation_input_tokens: cacheWrite } : {}),
        };
    }

    return events;
}

/** Close the open block and emit the terminal events. */
export function finishAnthropicStream(
    state: StreamState,
): AnthropicStreamEvent[] {
    const events: AnthropicStreamEvent[] = [];
    if (state.openIndex !== null) {
        events.push({
            type: "content_block_stop",
            index: state.openIndex,
            sequence_number: nextSequence(state),
        });
        state.openIndex = null;
        state.openType = null;
    }
    events.push({
        type: "message_delta",
        delta: { stop_reason: state.stopReason ?? "end_turn" },
        usage: { output_tokens: state.usage.output_tokens },
        sequence_number: nextSequence(state),
    });
    events.push({
        type: "message_stop",
        sequence_number: nextSequence(state),
    });
    return events;
}

export const createAnthropicStreamState = (options: {
    messageId: string;
    model: string;
}): StreamState => ({
    sequence: 0,
    messageId: options.messageId,
    model: options.model,
    started: false,
    openIndex: null,
    openType: null,
    toolIndex: 0,
    usage: baseUsage(),
    stopReason: null,
    sawUsage: false,
    startedToolIds: new Set(),
});

export type AnthropicStreamState = StreamState;

/**
 * Wrap an upstream Chat SSE body into an Anthropic Messages SSE body.
 * Events are encoded and enqueued as they are produced; the keepalive timer
 * emits `ping` frames during idle gaps.
 */
export function toAnthropicStream(input: {
    body: ReadableStream<Uint8Array<ArrayBuffer>>;
    messageId: string;
    model: string;
    keepaliveMs?: number;
}): ReadableStream<Uint8Array<ArrayBuffer>> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const state = createAnthropicStreamState({
        messageId: input.messageId,
        model: input.model,
    });
    const keepaliveMs = input.keepaliveMs ?? KEEPALIVE_INTERVAL_MS;

    const reader = input.body.getReader();
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let closed = false;
    const stopKeepalive = () => {
        if (closed) return;
        closed = true;
        if (pingTimer !== null) clearInterval(pingTimer);
        reader.cancel().catch(() => undefined);
    };

    return new ReadableStream<Uint8Array<ArrayBuffer>>({
        async start(controller) {
            let buffer = "";
            const emit = (event: AnthropicStreamEvent) => {
                if (closed) return;
                controller.enqueue(encoder.encode(toSseEvent(event)));
            };
            pingTimer = setInterval(() => {
                if (closed) return;
                emit({ type: "ping", sequence_number: state.sequence++ });
            }, keepaliveMs);

            // Anthropic always opens with message_start, even if the upstream
            // fails before its first chunk.
            emit({
                type: "message_start",
                message: {
                    id: state.messageId,
                    type: "message",
                    role: "assistant",
                    model: state.model,
                    content: [],
                    stop_reason: null,
                    stop_sequence: null,
                    usage: baseUsage(),
                },
                sequence_number: state.sequence++,
            });
            state.started = true;

            try {
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const segments = buffer.split("\n\n");
                    buffer = segments.pop() ?? "";
                    for (const segment of segments) {
                        const dataLines = segment
                            .split("\n")
                            .filter((line) => line.startsWith("data:"))
                            .map((line) => line.slice(5).trim());
                        const data = dataLines.join("");
                        if (!data || data === "[DONE]") continue;
                        let chunk: Record<string, unknown>;
                        try {
                            chunk = JSON.parse(data);
                        } catch {
                            continue;
                        }
                        for (const event of mapChatChunkToAnthropicEvents(
                            state,
                            chunk,
                        )) {
                            emit(event);
                        }
                    }
                }
                if (!state.sawUsage) {
                    // AGENTS.md: a streamed protocol must carry terminal usage
                    // or fail the stream — never end cleanly at zero tokens.
                    emit({
                        type: "error",
                        error: {
                            type: "api_error",
                            message:
                                "The provider did not report token usage; the response cannot be billed.",
                        },
                    });
                } else {
                    for (const event of finishAnthropicStream(state)) {
                        emit(event);
                    }
                }
            } catch (error) {
                emit({
                    type: "error",
                    error: {
                        type: "api_error",
                        message:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                });
            } finally {
                const alreadyClosed = closed;
                closed = true;
                if (pingTimer !== null) clearInterval(pingTimer);
                if (!alreadyClosed) controller.close();
            }
        },
        // Client disconnected: release the keepalive timer and the upstream
        // reader so neither leaks.
        cancel() {
            stopKeepalive();
        },
    });
}
