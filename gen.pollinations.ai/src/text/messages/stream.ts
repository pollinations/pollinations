import type { CompletionUsage } from "@shared/schemas/openai.ts";
import { EventSourceParserStream } from "eventsource-parser/stream";
import { messageId, messageUsage, stopReason } from "./response.ts";

// Claude Code aborts a stream that sends no bytes for 300 seconds, and models
// can reason silently for longer than that.
const PING_INTERVAL_MS = 15_000;

const encoder = new TextEncoder();
const event = (type: string, data: object = {}) =>
    encoder.encode(
        `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`,
    );

type ChatChunk = {
    choices?: {
        finish_reason?: string | null;
        delta?: {
            content?: string | null;
            reasoning_content?: string | null;
            // Claude streams its thinking as content blocks.
            content_blocks?: { delta?: { thinking?: string } }[];
            tool_calls?: {
                index: number;
                id?: string;
                function?: { name?: string; arguments?: string };
            }[];
        };
    }[];
    usage?: CompletionUsage | null;
    error?: { message?: string };
};

/**
 * Re-emit a Chat Completions SSE stream as Anthropic Messages events, one
 * content block at a time. The Chat stream has already been checked for usage:
 * when a provider omits it, it ends with an `error` chunk instead of `[DONE]`.
 */
export function chatStreamToMessageStream(
    body: ReadableStream<Uint8Array<ArrayBuffer>>,
    model: string,
): ReadableStream<Uint8Array> {
    const reader = body
        .pipeThrough(new TextDecoderStream())
        // The parser only dispatches on a blank line; providers may end without.
        .pipeThrough(
            new TransformStream<string, string>({
                flush: (controller) => controller.enqueue("\n\n"),
            }),
        )
        .pipeThrough(new EventSourceParserStream())
        .getReader();
    let pending: ReturnType<typeof reader.read> | undefined;
    let block = -1;
    let open: string | undefined;
    let finishReason: string | null | undefined;
    let hasToolCalls = false;
    const tools = new Map<
        number,
        { id?: string; name: string; parts: string[] }
    >();
    let usage: CompletionUsage | undefined;
    let done = false;

    const closeBlock = () => {
        if (open === undefined) return [];
        open = undefined;
        return [event("content_block_stop", { index: block })];
    };

    /** Append to the open block, or start a new one when the kind changes. */
    const write = (kind: string, content_block: object, delta: object) => {
        const events = [];
        if (open !== kind) {
            events.push(...closeBlock());
            open = kind;
            block += 1;
            events.push(
                event("content_block_start", { index: block, content_block }),
            );
        }
        return [
            ...events,
            event("content_block_delta", { index: block, delta }),
        ];
    };

    /** Anthropic events for one SSE data payload. */
    const translate = (data: string) => {
        if (data === "[DONE]") {
            done = true;
            // Chat providers can interleave parallel calls; Messages blocks
            // must finish before the next one starts.
            const toolEvents = [];
            for (const [index, call] of tools) {
                for (const partial_json of call.parts) {
                    toolEvents.push(
                        ...write(
                            `tool:${index}`,
                            {
                                type: "tool_use",
                                id: call.id,
                                name: call.name,
                                input: {},
                            },
                            { type: "input_json_delta", partial_json },
                        ),
                    );
                }
            }
            return [
                ...toolEvents,
                ...closeBlock(),
                event("message_delta", {
                    delta: {
                        stop_reason: stopReason(finishReason, hasToolCalls),
                        stop_sequence: null,
                    },
                    usage: messageUsage(usage as CompletionUsage),
                }),
                event("message_stop"),
            ];
        }
        const chunk = JSON.parse(data) as ChatChunk;
        if (chunk.error) {
            done = true;
            return [
                event("error", {
                    error: { type: "api_error", message: chunk.error.message },
                }),
            ];
        }
        if (chunk.usage?.prompt_tokens !== undefined) usage = chunk.usage;
        const [choice] = chunk.choices ?? [];
        finishReason = choice?.finish_reason ?? finishReason;
        const { delta } = choice ?? {};
        const events = [];
        const reasoning =
            delta?.reasoning_content ||
            delta?.content_blocks?.map((b) => b.delta?.thinking ?? "").join("");
        if (reasoning) {
            events.push(
                ...write(
                    "thinking",
                    { type: "thinking", thinking: "", signature: "" },
                    {
                        type: "thinking_delta",
                        thinking: reasoning,
                    },
                ),
            );
        }
        if (delta?.content) {
            events.push(
                ...write(
                    "text",
                    { type: "text", text: "" },
                    { type: "text_delta", text: delta.content },
                ),
            );
        }
        for (const call of delta?.tool_calls ?? []) {
            hasToolCalls = true;
            const tool = tools.get(call.index) ?? {
                id: call.id,
                name: "",
                parts: [] as string[],
            };
            tool.id = call.id ?? tool.id;
            tool.name += call.function?.name ?? "";
            tool.parts.push(call.function?.arguments ?? "");
            tools.set(call.index, tool);
        }
        return events;
    };

    return new ReadableStream({
        start(controller) {
            controller.enqueue(
                event("message_start", {
                    message: {
                        id: messageId(),
                        type: "message",
                        role: "assistant",
                        model,
                        content: [],
                        stop_reason: null,
                        stop_sequence: null,
                        usage: { input_tokens: 0, output_tokens: 0 },
                    },
                }),
            );
        },
        async pull(controller) {
            // A pull that enqueues nothing is never repeated, so keep reading
            // until there is something to send.
            for (;;) {
                pending ??= reader.read();
                let stopTimer = () => {};
                const silence = new Promise<undefined>((resolve) => {
                    const timer = setTimeout(resolve, PING_INTERVAL_MS);
                    stopTimer = () => clearTimeout(timer);
                });
                const next = await Promise.race([pending, silence]);
                stopTimer();
                if (!next) return controller.enqueue(event("ping"));
                pending = undefined;
                if (next.done) return controller.close();
                const events = translate(next.value.data);
                for (const chunk of events) controller.enqueue(chunk);
                if (done) {
                    controller.close();
                    return reader.cancel();
                }
                if (events.length) return;
            }
        },
        cancel: (reason) => reader.cancel(reason),
    });
}
