import { createParser } from "eventsource-parser";
import { anthropicErrorType } from "./errors.js";

type JsonObject = Record<string, unknown>;

type OpenBlock =
    | { kind: "thinking" }
    | { kind: "text" }
    | { kind: "tool_use"; openaiToolIndex: number };

function stopReasonFromFinish(finishReason: string | null): string {
    switch (finishReason) {
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

function usageFromChunk(usage: JsonObject) {
    const details = (usage.prompt_tokens_details ?? {}) as JsonObject;
    const cacheCreation =
        usage.cache_creation_input_tokens ??
        details.cache_write_tokens ??
        details.cache_creation_input_tokens;
    const cacheRead =
        usage.cache_read_input_tokens ??
        usage.cached_input_tokens ??
        details.cached_tokens;

    return {
        input_tokens: Number(usage.prompt_tokens ?? 0),
        output_tokens: Number(usage.completion_tokens ?? 0),
        ...(typeof cacheCreation === "number"
            ? { cache_creation_input_tokens: cacheCreation }
            : {}),
        ...(typeof cacheRead === "number"
            ? { cache_read_input_tokens: cacheRead }
            : {}),
    };
}

function toMessageId(id: string): string {
    return id.startsWith("msg_") ? id : `msg_${id.replace(/^pllns_/, "")}`;
}

/** Translates an OpenAI Chat Completions SSE stream into Anthropic Messages SSE events. */
export function toAnthropicMessageStream(
    body: ReadableStream<Uint8Array>,
    model: string,
): ReadableStream<Uint8Array> {
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    let started = false;
    let nextIndex = 0;
    let open: OpenBlock | null = null;
    let finishReason: string | null = null;
    let ended = false;
    // Streams controllers aren't exposed under one stable type across the DOM
    // and Workers lib targets this repo builds against; a single untyped slot
    // set at the top of transform()/flush() keeps every helper below plain.
    // biome-ignore lint/suspicious/noExplicitAny: see above
    let controller: any;

    function emit(event: string, data: unknown) {
        controller.enqueue(
            encoder.encode(
                `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
            ),
        );
    }

    function ensureStarted(chunk: JsonObject) {
        if (started) return;
        started = true;
        const id =
            typeof chunk.id === "string" ? chunk.id : crypto.randomUUID();
        emit("message_start", {
            type: "message_start",
            message: {
                id: toMessageId(id),
                type: "message",
                role: "assistant",
                model,
                content: [],
                stop_reason: null,
                stop_sequence: null,
                usage: { input_tokens: 0, output_tokens: 0 },
            },
        });
    }

    function closeOpenBlock() {
        if (!open) return;
        emit("content_block_stop", {
            type: "content_block_stop",
            index: nextIndex - 1,
        });
        open = null;
    }

    function openBlock(block: OpenBlock, contentBlock: JsonObject) {
        closeOpenBlock();
        open = block;
        emit("content_block_start", {
            type: "content_block_start",
            index: nextIndex,
            content_block: contentBlock,
        });
        nextIndex += 1;
    }

    function handleTextDelta(text: string) {
        if (open?.kind !== "text") {
            openBlock({ kind: "text" }, { type: "text", text: "" });
        }
        emit("content_block_delta", {
            type: "content_block_delta",
            index: nextIndex - 1,
            delta: { type: "text_delta", text },
        });
    }

    function handleThinkingDelta(thinking: string) {
        if (open?.kind !== "thinking") {
            openBlock({ kind: "thinking" }, { type: "thinking", thinking: "" });
        }
        emit("content_block_delta", {
            type: "content_block_delta",
            index: nextIndex - 1,
            delta: { type: "thinking_delta", thinking },
        });
    }

    function handleToolCallDelta(toolCall: JsonObject) {
        const openaiIndex = Number(toolCall.index ?? 0);
        const fn = (toolCall.function ?? {}) as JsonObject;
        if (open?.kind !== "tool_use" || open.openaiToolIndex !== openaiIndex) {
            openBlock(
                { kind: "tool_use", openaiToolIndex: openaiIndex },
                {
                    type: "tool_use",
                    id:
                        typeof toolCall.id === "string"
                            ? toolCall.id
                            : crypto.randomUUID(),
                    name: typeof fn.name === "string" ? fn.name : "",
                    input: {},
                },
            );
        }
        if (typeof fn.arguments === "string" && fn.arguments) {
            emit("content_block_delta", {
                type: "content_block_delta",
                index: nextIndex - 1,
                delta: { type: "input_json_delta", partial_json: fn.arguments },
            });
        }
    }

    function endWithError(message: string, status?: number) {
        if (ended) return;
        ended = true;
        closeOpenBlock();
        emit("error", {
            type: "error",
            error: { type: anthropicErrorType(status), message },
        });
    }

    function endWithUsage(usage: JsonObject) {
        if (ended) return;
        ended = true;
        closeOpenBlock();
        emit("message_delta", {
            type: "message_delta",
            delta: {
                stop_reason: stopReasonFromFinish(finishReason),
                stop_sequence: null,
            },
            usage: usageFromChunk(usage),
        });
        emit("message_stop", { type: "message_stop" });
    }

    function handleEvent(data: string) {
        if (ended) return;
        if (data.trim() === "[DONE]") {
            endWithUsage({});
            return;
        }

        let event: unknown;
        try {
            event = JSON.parse(data);
        } catch {
            return;
        }
        if (!event || typeof event !== "object") return;
        const chunk = event as JsonObject;

        if (chunk.error) {
            const error = chunk.error as JsonObject;
            endWithError(
                typeof error.message === "string"
                    ? error.message
                    : "Upstream provider ended the stream without usage",
                typeof error.status === "number" ? error.status : undefined,
            );
            return;
        }

        ensureStarted(chunk);

        const choice = Array.isArray(chunk.choices)
            ? (chunk.choices[0] as JsonObject | undefined)
            : undefined;
        const delta = (choice?.delta ?? {}) as JsonObject;

        if (
            typeof delta.reasoning_content === "string" &&
            delta.reasoning_content
        ) {
            handleThinkingDelta(delta.reasoning_content);
        }
        if (typeof delta.content === "string" && delta.content) {
            handleTextDelta(delta.content);
        }
        if (Array.isArray(delta.tool_calls)) {
            for (const toolCall of delta.tool_calls) {
                if (toolCall && typeof toolCall === "object") {
                    handleToolCallDelta(toolCall as JsonObject);
                }
            }
        }
        if (typeof choice?.finish_reason === "string") {
            finishReason = choice.finish_reason;
        }

        if (chunk.usage && typeof chunk.usage === "object") {
            endWithUsage(chunk.usage as JsonObject);
        }
    }

    const parser = createParser({
        onEvent(message) {
            handleEvent(message.data);
        },
    });

    return body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, streamController) {
                controller = streamController;
                parser.feed(decoder.decode(chunk, { stream: true }));
            },
            flush(streamController) {
                controller = streamController;
                parser.feed(decoder.decode());
                if (!ended) endWithUsage({});
            },
        }),
    );
}
