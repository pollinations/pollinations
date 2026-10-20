import {
    type CompletionUsage,
    CompletionUsageSchema,
} from "@shared/schemas/openai.ts";
import { createParser } from "eventsource-parser";
import { messagesUsage, stopReason, toolUseInput } from "./translate.ts";

// Claude Code aborts a stream after 300 seconds without bytes.
export const PING_INTERVAL_MS = 15_000;

type ChatDelta = {
    content?: string | null;
    reasoning_content?: string | null;
    reasoning?: string | null;
    content_blocks?: { delta?: { thinking?: string; signature?: string } }[];
    tool_calls?: {
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
    }[];
};

type ChatChunk = {
    id?: string;
    choices?: { delta?: ChatDelta; finish_reason?: string | null }[];
    usage?: CompletionUsage | null;
    error?: { message?: string };
};

type ToolCall = { id: string; name: string; arguments: string };

/**
 * Translate a Chat Completions SSE stream into Anthropic Messages events.
 *
 * Text and thinking stream as they arrive. Tool calls are emitted whole after
 * the model finishes, because chat providers may interleave the arguments of
 * parallel calls and Anthropic blocks cannot be reopened once stopped.
 */
export function chatToMessagesStream(
    body: ReadableStream<Uint8Array>,
    model: string,
    pingIntervalMs = PING_INTERVAL_MS,
): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const reader = body.getReader();
    const toolCalls = new Map<number, ToolCall>();
    let blockIndex = -1;
    let openBlock: "text" | "thinking" | null = null;
    let finishReason: string | null | undefined;
    let usage: CompletionUsage | undefined;
    let ended = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let lastWrite = Date.now();

    return new ReadableStream<Uint8Array>({
        start(controller) {
            const send = (event: string, data: object) => {
                if (ended) return;
                controller.enqueue(
                    encoder.encode(
                        `event: ${event}\ndata: ${JSON.stringify({ type: event, ...data })}\n\n`,
                    ),
                );
                lastWrite = Date.now();
            };
            const finish = () => {
                ended = true;
                clearInterval(timer);
                controller.close();
            };
            const fail = (message: string) => {
                send("error", { error: { type: "api_error", message } });
                finish();
            };
            const closeBlock = () => {
                if (openBlock)
                    send("content_block_stop", { index: blockIndex });
                openBlock = null;
            };
            const startBlock = (block: object) => {
                closeBlock();
                blockIndex += 1;
                send("content_block_start", {
                    index: blockIndex,
                    content_block: block,
                });
            };
            const thinkingDelta = (delta: object) => {
                if (openBlock !== "thinking") {
                    startBlock({
                        type: "thinking",
                        thinking: "",
                        signature: "",
                    });
                    openBlock = "thinking";
                }
                send("content_block_delta", { index: blockIndex, delta });
            };
            const complete = () => {
                if (!CompletionUsageSchema.safeParse(usage).success) {
                    fail("Provider returned no usage");
                    return;
                }
                closeBlock();
                for (const call of toolCalls.values()) {
                    startBlock({
                        type: "tool_use",
                        id: call.id,
                        name: call.name,
                        input: {},
                    });
                    send("content_block_delta", {
                        index: blockIndex,
                        delta: {
                            type: "input_json_delta",
                            partial_json: JSON.stringify(
                                toolUseInput(call.arguments),
                            ),
                        },
                    });
                    send("content_block_stop", { index: blockIndex });
                }
                send("message_delta", {
                    delta: {
                        stop_reason: stopReason(
                            finishReason,
                            toolCalls.size > 0,
                        ),
                        stop_sequence: null,
                    },
                    usage: messagesUsage(usage as CompletionUsage),
                });
                send("message_stop", {});
                finish();
            };
            const onChunk = (chunk: ChatChunk) => {
                if (chunk.error) {
                    fail(chunk.error.message ?? "Provider stream failed");
                    return;
                }
                if (chunk.usage) usage = chunk.usage;
                const choice = chunk.choices?.[0];
                if (!choice) return;
                if (choice.finish_reason) finishReason = choice.finish_reason;
                const delta = choice.delta ?? {};
                const reasoning = delta.reasoning_content ?? delta.reasoning;
                if (reasoning) {
                    thinkingDelta({
                        type: "thinking_delta",
                        thinking: reasoning,
                    });
                }
                for (const block of delta.content_blocks ?? []) {
                    if (block.delta?.thinking) {
                        thinkingDelta({
                            type: "thinking_delta",
                            thinking: block.delta.thinking,
                        });
                    }
                    if (block.delta?.signature) {
                        thinkingDelta({
                            type: "signature_delta",
                            signature: block.delta.signature,
                        });
                    }
                }
                if (delta.content) {
                    if (openBlock !== "text") {
                        startBlock({ type: "text", text: "" });
                        openBlock = "text";
                    }
                    send("content_block_delta", {
                        index: blockIndex,
                        delta: { type: "text_delta", text: delta.content },
                    });
                }
                for (const call of delta.tool_calls ?? []) {
                    const index = call.index ?? toolCalls.size;
                    const existing = toolCalls.get(index) ?? {
                        id: call.id ?? `toolu_${index}`,
                        name: "",
                        arguments: "",
                    };
                    existing.name += call.function?.name ?? "";
                    existing.arguments += call.function?.arguments ?? "";
                    toolCalls.set(index, existing);
                }
            };
            const parser = createParser({
                onEvent(event) {
                    if (ended) return;
                    if (event.data.trim() === "[DONE]") {
                        complete();
                        return;
                    }
                    try {
                        onChunk(JSON.parse(event.data) as ChatChunk);
                    } catch {
                        // Non-JSON keepalive or comment payloads carry nothing.
                    }
                },
            });

            send("message_start", {
                message: {
                    id: `msg_${crypto.randomUUID().replaceAll("-", "")}`,
                    type: "message",
                    role: "assistant",
                    model,
                    content: [],
                    stop_reason: null,
                    stop_sequence: null,
                    usage: { input_tokens: 0, output_tokens: 0 },
                },
            });
            timer = setInterval(() => {
                if (Date.now() - lastWrite >= pingIntervalMs) send("ping", {});
            }, pingIntervalMs / 3);

            (async () => {
                try {
                    // Read to the end even after the client stream closes:
                    // cancelling the chat response early left its text-cache
                    // write unfinished, so the request never settled.
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        if (!ended) {
                            parser.feed(
                                decoder.decode(value, { stream: true }),
                            );
                        }
                    }
                    if (!ended) fail("Provider stream ended before completion");
                } catch (error) {
                    fail(
                        error instanceof Error ? error.message : String(error),
                    );
                }
            })();
        },
        cancel(reason) {
            ended = true;
            clearInterval(timer);
            return reader.cancel(reason);
        },
    });
}
