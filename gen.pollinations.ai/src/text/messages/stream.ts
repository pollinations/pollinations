import { AnthropicApiError, anthropicErrorBody } from "./errors.js";

/**
 * Translate an OpenAI Chat Completions SSE stream into Anthropic Messages
 * SSE events, live (no buffering): Claude Code aborts after 300 seconds
 * without bytes, so deltas are forwarded as they arrive.
 *
 * Upstream contract (Chat Completions pipeline): `data:` JSON chunks with
 * `choices[].delta`, a usage-only chunk before `data: [DONE]`. A stream
 * that ends without provider usage ends with an `error` event instead of
 * a billed `message_stop` (issue #15490 billing rule).
 *
 * @see https://platform.claude.com/docs/en/build-with-claude/streaming
 */

interface UpstreamChunk {
    id?: string;
    model?: string;
    choices?: {
        delta?: {
            content?: string | null;
            reasoning_content?: string | null;
            tool_calls?: {
                index?: number;
                id?: string;
                function?: { name?: string; arguments?: string };
            }[];
        };
        finish_reason?: string | null;
    }[];
    usage?: Record<string, unknown> | null;
    error?: string | { message?: string };
}

function sseData(chunk: Record<string, unknown>): Uint8Array {
    const type = typeof chunk.type === "string" ? chunk.type : "message";
    return new TextEncoder().encode(
        `event: ${type}\ndata: ${JSON.stringify(chunk)}\n\n`,
    );
}

function stopReasonFor(finish: string | null | undefined): string | null {
    switch (finish) {
        case "tool_calls":
        case "function_call":
            return "tool_use";
        case "length":
            return "max_tokens";
        case "stop":
        case "end_turn":
        case null:
        case undefined:
            return "end_turn";
        default:
            return "end_turn";
    }
}

class MessagesEventBuilder {
    private messageId: string;
    private model: string;
    private messageStarted = false;
    private inputTokens = 0;
    private outputTokens = 0;
    private sawUsage = false;
    private currentIndex = -1;
    private currentType: string | null = null;
    /** Upstream tool_call index -> our content block index. */
    private toolBlockByIndex = new Map<number, number>();
    private nextBlockIndex = 0;
    private finishReason: string | null = null;

    constructor(messageId: string, model: string) {
        this.messageId = messageId;
        this.model = model;
    }

    private startMessage(): Uint8Array[] {
        if (this.messageStarted) return [];
        this.messageStarted = true;
        return [
            sseData({
                type: "message_start",
                message: {
                    id: `msg_${this.messageId}`,
                    type: "message",
                    role: "assistant",
                    model: this.model,
                    content: [],
                    stop_reason: null,
                    stop_sequence: null,
                    usage: { input_tokens: 0, output_tokens: 0 },
                },
            }),
        ];
    }

    private closeCurrentBlock(): Uint8Array[] {
        if (this.currentType === null) return [];
        const events = [
            sseData({
                type: "content_block_stop",
                index: this.currentIndex,
            }),
        ];
        this.currentType = null;
        this.currentIndex = -1;
        return events;
    }

    private openBlock(
        type: string,
        contentBlock: Record<string, unknown>,
    ): Uint8Array[] {
        const closed = this.closeCurrentBlock();
        this.currentIndex = this.nextBlockIndex++;
        this.currentType = type;
        return [
            ...closed,
            sseData({
                type: "content_block_start",
                index: this.currentIndex,
                content_block: contentBlock,
            }),
        ];
    }

    /** Consume one upstream chunk; return the events it maps to. */
    ingest(chunk: UpstreamChunk): Uint8Array[] {
        if (chunk.error) {
            const message =
                typeof chunk.error === "string"
                    ? chunk.error
                    : (chunk.error.message ?? "Text generation failed");
            throw new AnthropicApiError(502, message);
        }
        const events = this.startMessage();
        if (chunk.usage && typeof chunk.usage === "object") {
            this.sawUsage = true;
            const read = (key: string): number =>
                typeof chunk.usage?.[key] === "number"
                    ? (chunk.usage[key] as number)
                    : 0;
            this.inputTokens =
                read("prompt_tokens") || read("input_tokens") || 0;
            this.outputTokens =
                read("completion_tokens") || read("output_tokens") || 0;
        }
        const choice = chunk.choices?.[0];
        if (!choice) return events;
        if (choice.finish_reason) {
            this.finishReason = choice.finish_reason;
        }
        const delta = choice.delta ?? {};
        if (
            typeof delta.reasoning_content === "string" &&
            delta.reasoning_content
        ) {
            if (this.currentType !== "thinking") {
                events.push(
                    ...this.openBlock("thinking", {
                        type: "thinking",
                        thinking: "",
                    }),
                );
            }
            events.push(
                sseData({
                    type: "content_block_delta",
                    index: this.currentIndex,
                    delta: {
                        type: "thinking_delta",
                        thinking: delta.reasoning_content,
                    },
                }),
            );
        }
        if (typeof delta.content === "string" && delta.content) {
            if (this.currentType !== "text") {
                events.push(
                    ...this.openBlock("text", { type: "text", text: "" }),
                );
            }
            events.push(
                sseData({
                    type: "content_block_delta",
                    index: this.currentIndex,
                    delta: { type: "text_delta", text: delta.content },
                }),
            );
        }
        for (const toolCall of delta.tool_calls ?? []) {
            const upstreamIndex = toolCall.index ?? 0;
            let blockIndex = this.toolBlockByIndex.get(upstreamIndex);
            if (blockIndex === undefined) {
                const started = this.openBlock("tool_use", {
                    type: "tool_use",
                    id: toolCall.id ?? `toolu_${crypto.randomUUID()}`,
                    name: toolCall.function?.name ?? "",
                    input: {},
                });
                events.push(...started);
                blockIndex = this.currentIndex;
                this.toolBlockByIndex.set(upstreamIndex, blockIndex);
            }
            const argumentsDelta = toolCall.function?.arguments;
            if (argumentsDelta) {
                events.push(
                    sseData({
                        type: "content_block_delta",
                        index: blockIndex,
                        delta: {
                            type: "input_json_delta",
                            partial_json: argumentsDelta,
                        },
                    }),
                );
            }
        }
        return events;
    }

    /** Terminal events: must be called once after the upstream ends. */
    finish(): Uint8Array[] {
        if (!this.messageStarted) {
            throw new AnthropicApiError(
                502,
                "Upstream stream ended without any content",
            );
        }
        const events = this.closeCurrentBlock();
        if (!this.sawUsage) {
            // The stream is unbilled without provider usage: fail the
            // stream with an error event (never message_stop).
            events.push(
                new TextEncoder().encode(
                    `event: error\ndata: ${anthropicErrorBody({
                        status: 502,
                        message:
                            "Upstream stream ended without usage; refusing to bill a message without usage",
                    })}\n\n`,
                ),
            );
            return events;
        }
        events.push(
            sseData({
                type: "message_delta",
                delta: {
                    stop_reason: stopReasonFor(this.finishReason),
                    stop_sequence: null,
                },
                usage: {
                    input_tokens: this.inputTokens,
                    output_tokens: this.outputTokens,
                },
            }),
            sseData({ type: "message_stop" }),
        );
        return events;
    }
}

type LineHandler = (line: string) => Uint8Array[];

function makeLineProcessor(
    handleLine: LineHandler,
): (line: string) => Uint8Array[] {
    return handleLine;
}

/**
 * Wrap the upstream Chat Completions SSE byte stream into Anthropic
 * Messages SSE events.
 */
export function toAnthropicMessageStream(
    upstream: ReadableStream<Uint8Array>,
    messageId: string,
    model: string,
): ReadableStream<Uint8Array> {
    const builder = new MessagesEventBuilder(messageId, model);
    const decoder = new TextDecoder();
    let buffer = "";
    let upstreamError: unknown = null;
    const processLine = makeLineProcessor((line: string) => {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) return [];
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") return [];
        let chunk: UpstreamChunk;
        try {
            chunk = JSON.parse(payload) as UpstreamChunk;
        } catch {
            return [];
        }
        return builder.ingest(chunk);
    });
    return upstream.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
                buffer += decoder.decode(chunk, { stream: true });
                for (;;) {
                    const newlineIndex = buffer.indexOf("\n");
                    if (newlineIndex === -1) break;
                    const line = buffer.slice(0, newlineIndex);
                    buffer = buffer.slice(newlineIndex + 1);
                    try {
                        for (const event of processLine(line)) {
                            controller.enqueue(event);
                        }
                    } catch (error) {
                        upstreamError = error;
                        throw error;
                    }
                }
            },
            flush(controller) {
                buffer += decoder.decode();
                if (upstreamError) {
                    controller.enqueue(
                        new TextEncoder().encode(
                            `event: error\ndata: ${anthropicErrorBody(
                                upstreamError instanceof AnthropicApiError
                                    ? {
                                          status: upstreamError.status,
                                          message: upstreamError.message,
                                          retryAfterSeconds:
                                              upstreamError.retryAfterSeconds,
                                      }
                                    : {
                                          status: 502,
                                          message:
                                              "Upstream stream failed before completion",
                                      },
                            )}\n\n`,
                        ),
                    );
                    return;
                }
                for (const event of builder.finish()) {
                    controller.enqueue(event);
                }
            },
        }),
    );
}
