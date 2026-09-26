import type { EventSourceMessage } from "eventsource-parser";
import { createParser } from "eventsource-parser";
import {
    chatFinishReasonToAnthropic,
    chatUsageToAnthropic,
} from "./response.js";

type JsonObject = Record<string, unknown>;

type ToolAccumulator = {
    id: string;
    name: string;
    arguments: string;
};

export const ANTHROPIC_STREAM_HEARTBEAT_MS = 15_000;

function sse(type: string, data: unknown): Uint8Array<ArrayBuffer> {
    return new TextEncoder().encode(
        `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`,
    );
}

function asObject(value: unknown): JsonObject | undefined {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as JsonObject)
        : undefined;
}

function errorMessage(value: unknown): string {
    const error = asObject(value);
    return typeof error?.message === "string" && error.message
        ? error.message
        : "Text generation failed";
}

function parseToolInput(value: string): unknown {
    try {
        return JSON.parse(value || "{}");
    } catch {
        return null;
    }
}

export function chatStreamToAnthropic(
    source: ReadableStream<Uint8Array<ArrayBuffer>>,
    model: string,
): ReadableStream<Uint8Array<ArrayBuffer>> {
    const reader = source.getReader();
    const decoder = new TextDecoder();
    const messageId = `msg_${crypto.randomUUID().replaceAll("-", "")}`;
    let cancelled = false;

    return new ReadableStream<Uint8Array<ArrayBuffer>>({
        start(controller) {
            let nextBlockIndex = 0;
            let active:
                | {
                      kind: "thinking" | "text";
                      index: number;
                      signatureEmitted: boolean;
                  }
                | undefined;
            let finishReason: unknown;
            let lastUsage: unknown;
            let terminal = false;
            const tools = new Map<number, ToolAccumulator>();

            const emit = (type: string, data: unknown) => {
                if (!terminal && !cancelled)
                    controller.enqueue(sse(type, data));
            };

            const closeActive = () => {
                if (!active) return;
                if (active.kind === "thinking" && !active.signatureEmitted) {
                    emit("content_block_delta", {
                        type: "content_block_delta",
                        index: active.index,
                        delta: {
                            type: "signature_delta",
                            signature: "pollinations",
                        },
                    });
                }
                emit("content_block_stop", {
                    type: "content_block_stop",
                    index: active.index,
                });
                active = undefined;
            };

            const open = (kind: "thinking" | "text") => {
                if (active?.kind === kind) return active.index;
                closeActive();
                const index = nextBlockIndex++;
                active = {
                    kind,
                    index,
                    signatureEmitted: false,
                };
                emit("content_block_start", {
                    type: "content_block_start",
                    index,
                    content_block:
                        kind === "thinking"
                            ? {
                                  type: "thinking",
                                  thinking: "",
                                  signature: "",
                              }
                            : { type: "text", text: "" },
                });
                return index;
            };

            const emitSignature = (signature: string) => {
                const index = open("thinking");
                emit("content_block_delta", {
                    type: "content_block_delta",
                    index,
                    delta: {
                        type: "signature_delta",
                        signature,
                    },
                });
                if (active?.kind === "thinking") {
                    active.signatureEmitted = true;
                }
            };

            const emitRedactedThinking = (data: string) => {
                closeActive();
                const index = nextBlockIndex++;
                emit("content_block_start", {
                    type: "content_block_start",
                    index,
                    content_block: {
                        type: "redacted_thinking",
                        data,
                    },
                });
                emit("content_block_stop", {
                    type: "content_block_stop",
                    index,
                });
            };

            const emitTools = (): boolean => {
                for (const [, tool] of [...tools.entries()].sort(
                    ([left], [right]) => left - right,
                )) {
                    const input = parseToolInput(tool.arguments);
                    if (input === null) {
                        emitError("Text model returned invalid tool call JSON");
                        return false;
                    }
                    const index = nextBlockIndex++;
                    emit("content_block_start", {
                        type: "content_block_start",
                        index,
                        content_block: {
                            type: "tool_use",
                            id: tool.id,
                            name: tool.name,
                            input: {},
                        },
                    });
                    emit("content_block_delta", {
                        type: "content_block_delta",
                        index,
                        delta: {
                            type: "input_json_delta",
                            partial_json: tool.arguments || "{}",
                        },
                    });
                    emit("content_block_stop", {
                        type: "content_block_stop",
                        index,
                    });
                }
                return true;
            };

            const emitError = (message: string, type = "api_error") => {
                if (terminal || cancelled) return;
                closeActive();
                controller.enqueue(
                    sse("error", {
                        type: "error",
                        error: { type, message },
                    }),
                );
                terminal = true;
                controller.close();
            };

            const finish = () => {
                if (terminal) return;
                closeActive();
                if (!emitTools() || terminal) return;
                let usage: ReturnType<typeof chatUsageToAnthropic>;
                try {
                    usage = chatUsageToAnthropic(lastUsage);
                } catch (error) {
                    if (cancelled) return;
                    emitError(
                        error instanceof Error
                            ? error.message
                            : "Chat Completions provider omitted valid usage",
                    );
                    return;
                }
                emit("message_delta", {
                    type: "message_delta",
                    delta: {
                        container: null,
                        stop_details: null,
                        stop_reason:
                            tools.size > 0
                                ? "tool_use"
                                : chatFinishReasonToAnthropic(finishReason),
                        stop_sequence: null,
                    },
                    usage: {
                        input_tokens: usage.input_tokens,
                        output_tokens: usage.output_tokens,
                        cache_creation_input_tokens:
                            usage.cache_creation_input_tokens,
                        cache_read_input_tokens: usage.cache_read_input_tokens,
                        output_tokens_details: usage.output_tokens_details,
                        server_tool_use: null,
                    },
                });
                emit("message_stop", { type: "message_stop" });
                terminal = true;
                controller.close();
            };

            const toolDelta = (raw: unknown) => {
                const call = asObject(raw);
                if (!call) return;
                const index =
                    typeof call.index === "number" &&
                    Number.isSafeInteger(call.index)
                        ? call.index
                        : 0;
                const current = tools.get(index) ?? {
                    id: "",
                    name: "",
                    arguments: "",
                };
                if (typeof call.id === "string") current.id ||= call.id;
                const fn = asObject(call.function);
                if (typeof fn?.name === "string") current.name += fn.name;
                if (typeof fn?.arguments === "string") {
                    current.arguments += fn.arguments;
                }
                tools.set(index, current);
            };

            const handleEvent = (message: EventSourceMessage) => {
                if (terminal) return;
                if (message.data.trim() === "[DONE]") {
                    finish();
                    return;
                }

                let value: unknown;
                try {
                    value = JSON.parse(message.data);
                } catch {
                    return;
                }
                const event = asObject(value);
                if (!event) return;
                if (event.error) {
                    const err = asObject(event.error);
                    emitError(
                        errorMessage(event.error),
                        err?.code === "usage_missing"
                            ? "api_error"
                            : typeof err?.type === "string"
                              ? err.type
                              : "api_error",
                    );
                    return;
                }
                if (event.usage !== undefined && event.usage !== null) {
                    lastUsage = event.usage;
                }

                const choice =
                    Array.isArray(event.choices) && event.choices.length
                        ? asObject(event.choices[0])
                        : undefined;
                if (!choice) return;
                if (choice.finish_reason != null) {
                    finishReason = choice.finish_reason;
                }
                const delta = asObject(choice.delta);
                if (!delta) return;

                let blockThinking = false;
                let blockText = false;
                if (Array.isArray(delta.content_blocks)) {
                    for (const rawBlock of delta.content_blocks) {
                        const block = asObject(rawBlock);
                        const blockDelta = asObject(block?.delta) ?? block;
                        if (!blockDelta) continue;

                        if (
                            typeof blockDelta.thinking === "string" &&
                            blockDelta.thinking
                        ) {
                            blockThinking = true;
                            const index = open("thinking");
                            emit("content_block_delta", {
                                type: "content_block_delta",
                                index,
                                delta: {
                                    type: "thinking_delta",
                                    thinking: blockDelta.thinking,
                                },
                            });
                        }
                        if (
                            typeof blockDelta.signature === "string" &&
                            blockDelta.signature
                        ) {
                            blockThinking = true;
                            emitSignature(blockDelta.signature);
                        }
                        if (
                            typeof blockDelta.data === "string" &&
                            blockDelta.data
                        ) {
                            blockThinking = true;
                            emitRedactedThinking(blockDelta.data);
                        }
                        if (
                            typeof blockDelta.text === "string" &&
                            blockDelta.text
                        ) {
                            blockText = true;
                            const index = open("text");
                            emit("content_block_delta", {
                                type: "content_block_delta",
                                index,
                                delta: {
                                    type: "text_delta",
                                    text: blockDelta.text,
                                },
                            });
                        }
                    }
                }

                if (
                    !blockThinking &&
                    typeof delta.reasoning_content === "string" &&
                    delta.reasoning_content
                ) {
                    const index = open("thinking");
                    emit("content_block_delta", {
                        type: "content_block_delta",
                        index,
                        delta: {
                            type: "thinking_delta",
                            thinking: delta.reasoning_content,
                        },
                    });
                }
                if (
                    !blockText &&
                    typeof delta.content === "string" &&
                    delta.content
                ) {
                    const index = open("text");
                    emit("content_block_delta", {
                        type: "content_block_delta",
                        index,
                        delta: {
                            type: "text_delta",
                            text: delta.content,
                        },
                    });
                }
                if (Array.isArray(delta.tool_calls)) {
                    for (const call of delta.tool_calls) toolDelta(call);
                }
            };

            const parser = createParser({ onEvent: handleEvent });

            controller.enqueue(
                sse("message_start", {
                    type: "message_start",
                    message: {
                        id: messageId,
                        type: "message",
                        role: "assistant",
                        model,
                        container: null,
                        content: [],
                        stop_details: null,
                        stop_reason: null,
                        stop_sequence: null,
                        usage: {
                            input_tokens: 0,
                            output_tokens: 0,
                            cache_creation_input_tokens: 0,
                            cache_read_input_tokens: 0,
                            cache_creation: null,
                            inference_geo: null,
                            output_tokens_details: null,
                            server_tool_use: null,
                            service_tier: null,
                        },
                    },
                }),
            );

            const waitForRead = async (
                pending: Promise<
                    ReadableStreamReadResult<Uint8Array<ArrayBuffer>>
                >,
            ): Promise<
                | {
                      kind: "read";
                      result: ReadableStreamReadResult<Uint8Array<ArrayBuffer>>;
                  }
                | { kind: "heartbeat" }
            > =>
                new Promise((resolve, reject) => {
                    const timer = setTimeout(
                        () => resolve({ kind: "heartbeat" }),
                        ANTHROPIC_STREAM_HEARTBEAT_MS,
                    );
                    pending.then(
                        (result) => {
                            clearTimeout(timer);
                            resolve({ kind: "read", result });
                        },
                        (error) => {
                            clearTimeout(timer);
                            reject(error);
                        },
                    );
                });

            const pump = async () => {
                let pending = reader.read();
                try {
                    while (!terminal && !cancelled) {
                        const next = await waitForRead(pending);
                        if (next.kind === "heartbeat") {
                            emit("ping", { type: "ping" });
                            continue;
                        }
                        if (next.result.done) {
                            if (cancelled) return;
                            parser.feed(`${decoder.decode()}\n\n`);
                            if (!terminal) {
                                emitError(
                                    "Chat Completions provider ended without a terminal event",
                                );
                            }
                            return;
                        }
                        parser.feed(
                            decoder.decode(next.result.value, { stream: true }),
                        );
                        if (terminal) return;
                        pending = reader.read();
                    }
                } catch (error) {
                    emitError(
                        error instanceof Error
                            ? error.message
                            : "Chat Completions stream failed",
                    );
                } finally {
                    if (terminal && !cancelled) {
                        void reader.cancel().catch(() => {});
                    }
                }
            };
            void pump();
        },
        cancel() {
            cancelled = true;
            return reader.cancel();
        },
    });
}
