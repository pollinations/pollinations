// Re-frame an OpenAI Chat Completions SSE stream as Anthropic Messages SSE.
//
// Frames carry Anthropic's `event:` field (both official SDKs require it)
// and follow the standard order:
//   message_start -> content_block_start/delta/stop (thinking, text,
//   tool_use with incremental input_json_delta) -> message_delta (usage)
//   -> message_stop
// Bytes are forwarded live (no buffering): a `ping` event is emitted
// whenever the upstream goes quiet, so Claude Code's 300s no-bytes abort
// cannot trip during long silent reasoning.
//
// A stream that ends without provider usage (or with an upstream error)
// ends with an `error` event instead of `message_stop` — never silently
// unbilled.
import { CompletionUsageSchema } from "@shared/schemas/openai.ts";
import { createParser } from "eventsource-parser";

export const MESSAGES_PING_INTERVAL_MS = 15_000;

type StreamToolCallDelta = {
    index?: unknown;
    id?: unknown;
    function?: { name?: unknown; arguments?: unknown };
};

type StreamDelta = {
    content?: unknown;
    reasoning_content?: unknown;
    role?: unknown;
    tool_calls?: unknown;
};

type StreamChoice = {
    delta?: StreamDelta;
    finish_reason?: unknown;
};

type StreamChunk = {
    id?: unknown;
    model?: unknown;
    choices?: StreamChoice[];
    usage?: unknown;
    error?: unknown;
};

function sseEvent(type: string, payload: unknown): Uint8Array<ArrayBuffer> {
    return new TextEncoder().encode(
        `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`,
    );
}

function messagesErrorEvent(message: string): Uint8Array<ArrayBuffer> {
    return sseEvent("error", {
        type: "error",
        error: { type: "api_error", message },
    });
}

const PING_EVENT = sseEvent("ping", { type: "ping" });

function mapStopReason(finishReason: unknown, sawToolCalls: boolean): string {
    if (sawToolCalls) return "tool_use";
    switch (finishReason) {
        case "tool_calls":
            return "tool_use";
        case "length":
            return "max_tokens";
        case "content_filter":
            return "refusal";
        default:
            return "end_turn";
    }
}

function usageOrUndefined(value: unknown) {
    const parsed = CompletionUsageSchema.safeParse(value);
    return parsed.success ? parsed.data : undefined;
}

type OpenBlock =
    | { kind: "text" | "thinking"; index: number }
    | { kind: "tool"; index: number; id: string; name: string };

type PendingTool = {
    id?: string;
    name?: string;
    bufferedArgs: string;
    started: boolean;
    emittedIndex?: number;
};

export type MessagesStreamOptions = {
    model: string;
    messageId?: string;
    /** Quiet interval before a ping is emitted. Shorten in tests. */
    pingIntervalMs?: number;
};

export function chatStreamToMessagesStream(
    source: ReadableStream<Uint8Array<ArrayBuffer>>,
    options: MessagesStreamOptions,
): ReadableStream<Uint8Array<ArrayBuffer>> {
    const messageId =
        options.messageId ?? `msg_${crypto.randomUUID().replaceAll("-", "")}`;
    const pingIntervalMs =
        options.pingIntervalMs ?? MESSAGES_PING_INTERVAL_MS;

    const decoder = new TextDecoder();
    const out: Uint8Array<ArrayBuffer>[] = [];

    let started = false;
    let ended = false;
    let errored = false;
    let lastUsage: ReturnType<typeof usageOrUndefined>;
    let finishReason: unknown;
    let sawToolCalls = false;
    const blocks: OpenBlock[] = [];
    const pendingTools = new Map<number, PendingTool>();
    let nextIndex = 0;

    function ensureBlock(kind: "text" | "thinking"): number {
        const existing = blocks.find((block) => block.kind === kind);
        if (existing) return existing.index;
        const index = nextIndex++;
        blocks.push({ kind, index });
        out.push(
            sseEvent("content_block_start", {
                type: "content_block_start",
                index,
                content_block:
                    kind === "text"
                        ? { type: "text", text: "" }
                        : { type: "thinking", thinking: "" },
            }),
        );
        return index;
    }

    function emitDelta(index: number, delta: unknown) {
        out.push(
            sseEvent("content_block_delta", {
                type: "content_block_delta",
                index,
                delta,
            }),
        );
    }

    function startToolBlock(slot: number, tool: PendingTool & { id: string }) {
        const index = nextIndex++;
        const name = tool.name ?? "";
        tool.started = true;
        tool.emittedIndex = index;
        blocks.push({ kind: "tool", index, id: tool.id, name });
        out.push(
            sseEvent("content_block_start", {
                type: "content_block_start",
                index,
                content_block: { type: "tool_use", id: tool.id, name, input: {} },
            }),
        );
        if (tool.bufferedArgs) {
            emitDelta(index, {
                type: "input_json_delta",
                partial_json: tool.bufferedArgs,
            });
            tool.bufferedArgs = "";
        }
        pendingTools.set(slot, tool);
    }

    function handleToolCallDelta(raw: unknown) {
        if (!raw || typeof raw !== "object") return;
        const delta = raw as StreamToolCallDelta;
        const slot =
            typeof delta.index === "number" &&
            Number.isSafeInteger(delta.index) &&
            delta.index >= 0
                ? delta.index
                : 0;
        const pending = pendingTools.get(slot) ?? {
            bufferedArgs: "",
            started: false,
        };
        if (typeof delta.id === "string" && delta.id) pending.id = delta.id;
        if (typeof delta.function?.name === "string" && delta.function.name) {
            pending.name = delta.function.name;
        }
        const args =
            typeof delta.function?.arguments === "string"
                ? delta.function.arguments
                : "";
        if (args) {
            sawToolCalls = true;
            if (pending.started && pending.emittedIndex !== undefined) {
                emitDelta(pending.emittedIndex, {
                    type: "input_json_delta",
                    partial_json: args,
                });
            } else {
                pending.bufferedArgs += args;
            }
        }
        if (!pending.started && pending.id) {
            startToolBlock(slot, pending as PendingTool & { id: string });
        } else {
            pendingTools.set(slot, pending);
        }
    }

    function emitStart() {
        started = true;
        out.push(
            sseEvent("message_start", {
                type: "message_start",
                message: {
                    id: messageId,
                    type: "message",
                    role: "assistant",
                    content: [],
                    model: options.model,
                    stop_reason: null,
                    stop_sequence: null,
                    usage: { input_tokens: 0, output_tokens: 0 },
                },
            }),
        );
    }

    function closeBlocks() {
        for (const block of blocks) {
            out.push(
                sseEvent("content_block_stop", {
                    type: "content_block_stop",
                    index: block.index,
                }),
            );
        }
        blocks.length = 0;
    }

    function finishOk() {
        ended = true;
        closeBlocks();
        const usage = lastUsage!;
        out.push(
            sseEvent("message_delta", {
                type: "message_delta",
                delta: {
                    stop_reason: mapStopReason(finishReason, sawToolCalls),
                    stop_sequence: null,
                },
                usage: {
                    input_tokens: usage.prompt_tokens,
                    output_tokens: usage.completion_tokens,
                    ...(usage.prompt_tokens_details?.cached_tokens ||
                    usage.cached_input_tokens ||
                    usage.cache_read_input_tokens
                        ? {
                              cache_read_input_tokens:
                                  usage.prompt_tokens_details?.cached_tokens ??
                                  usage.cached_input_tokens ??
                                  usage.cache_read_input_tokens ??
                                  0,
                          }
                        : {}),
                    ...(usage.prompt_tokens_details?.cache_write_tokens ||
                    usage.prompt_tokens_details?.cache_creation_input_tokens ||
                    usage.cache_creation_input_tokens
                        ? {
                              cache_creation_input_tokens:
                                  usage.prompt_tokens_details
                                      ?.cache_write_tokens ??
                                  usage.prompt_tokens_details
                                      ?.cache_creation_input_tokens ??
                                  usage.cache_creation_input_tokens ??
                                  0,
                          }
                        : {}),
                },
            }),
        );
        out.push(sseEvent("message_stop", { type: "message_stop" }));
    }

    function finishMissingUsage() {
        ended = true;
        errored = true;
        out.push(
            messagesErrorEvent(
                "Chat Completions provider ended without terminal usage",
            ),
        );
    }

    function fail(message: string) {
        if (ended) return;
        ended = true;
        errored = true;
        out.push(messagesErrorEvent(message));
    }

    function handleChunk(chunk: StreamChunk) {
        if (ended) return;
        if (chunk.error && typeof chunk.error === "object") {
            const message = (chunk.error as { message?: unknown }).message;
            fail(
                typeof message === "string" && message
                    ? message
                    : "Chat Completions provider failed the request",
            );
            return;
        }
        const usage = usageOrUndefined(chunk.usage);
        if (usage) lastUsage = usage;
        const choices = Array.isArray(chunk.choices) ? chunk.choices : [];
        for (const choice of choices) {
            if (!choice || typeof choice !== "object") continue;
            if (
                choice.finish_reason !== null &&
                choice.finish_reason !== undefined
            ) {
                finishReason = choice.finish_reason;
            }
            const delta = choice.delta;
            if (!delta || typeof delta !== "object") continue;
            if (
                typeof delta.content === "string" &&
                delta.content &&
                !errored
            ) {
                if (!started) emitStart();
                emitDelta(ensureBlock("text"), {
                    type: "text_delta",
                    text: delta.content,
                });
            }
            if (
                typeof delta.reasoning_content === "string" &&
                delta.reasoning_content &&
                !errored
            ) {
                if (!started) emitStart();
                emitDelta(ensureBlock("thinking"), {
                    type: "thinking_delta",
                    thinking: delta.reasoning_content,
                });
            }
            if (Array.isArray(delta.tool_calls)) {
                if (!started) emitStart();
                for (const toolCall of delta.tool_calls) {
                    handleToolCallDelta(toolCall);
                }
            }
        }
        // A usage-only chunk still proves the model responded.
        if (!started && usage) emitStart();
    }

    const parser = createParser({
        onEvent(message) {
            if (ended) return;
            if (message.data.trim() === "[DONE]") {
                if (errored) {
                    ended = true;
                    return;
                }
                if (lastUsage) finishOk();
                else finishMissingUsage();
                return;
            }
            let event: unknown;
            try {
                event = JSON.parse(message.data);
            } catch {
                return;
            }
            if (!event || typeof event !== "object") return;
            handleChunk(event as StreamChunk);
        },
    });

    let timer: ReturnType<typeof setInterval> | undefined;
    const reader = source.getReader();

    return new ReadableStream<Uint8Array<ArrayBuffer>>({
        async start(controller) {
            let quiet = false;
            timer = setInterval(() => {
                if (ended || !quiet) {
                    quiet = true;
                    return;
                }
                controller.enqueue(PING_EVENT);
            }, pingIntervalMs);
            // Avoid keeping the worker alive on a stalled upstream: pings
            // are best-effort, not a reason to hold the isolate.
            (timer as unknown as { unref?: () => void }).unref?.();
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    quiet = false;
                    parser.feed(decoder.decode(value, { stream: true }));
                    for (const bytes of out.splice(0)) {
                        controller.enqueue(bytes);
                    }
                    if (ended) {
                        // Drain nothing further: the terminal event is final.
                        await reader.cancel().catch(() => {});
                        break;
                    }
                }
                if (!ended) {
                    // Providers may close after one newline instead of [DONE].
                    parser.feed(`${decoder.decode()}\n\n`);
                    if (lastUsage && !errored) finishOk();
                    else if (!errored) finishMissingUsage();
                }
                for (const bytes of out.splice(0)) {
                    controller.enqueue(bytes);
                }
            } catch (error) {
                out.push(
                    messagesErrorEvent(
                        error instanceof Error
                            ? error.message
                            : "Message stream failed",
                    ),
                );
                for (const bytes of out.splice(0)) {
                    controller.enqueue(bytes);
                }
            } finally {
                if (timer !== undefined) clearInterval(timer);
                controller.close();
            }
        },
        async cancel() {
            if (timer !== undefined) clearInterval(timer);
            await reader.cancel().catch(() => {});
        },
    });
}
