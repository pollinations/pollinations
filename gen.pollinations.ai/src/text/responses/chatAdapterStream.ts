import type { CreateResponseRequest } from "@shared/schemas/openai.ts";
import { createParser } from "eventsource-parser";
import type { ChatCompletion } from "../types.js";
import { chatUsageToResponseUsage } from "./chatAdapter.js";

type JsonObject = Record<string, unknown>;

type ChatChunkChoice = JsonObject & {
    delta?: unknown;
    finish_reason?: unknown;
};

type ChatChunk = JsonObject & {
    usage?: unknown;
    choices?: unknown;
    error?: unknown;
};

type ToolCallState = {
    id: string;
    name: string;
    arguments: string;
};

type MessagePart = {
    type: "output_text" | "refusal";
    text: string;
};

/**
 * Translate a Chat Completions SSE stream into Responses SSE events.
 *
 * Mirrors `streamingChatCompletion` in chatResponse.ts, in the opposite
 * direction: Chat deltas become Responses output events, and the Chat
 * terminal usage chunk becomes `response.completed` usage. Missing usage
 * flows through as `usage: null` so `requireResponsesStreamUsage` fails the
 * stream exactly like a native provider that omits usage.
 *
 * Output layout: message at index 0, reasoning at index 1, function calls at
 * index 2 + stream order.
 */
export function chatStreamToResponsesEvents(
    completion: ChatCompletion,
    request: CreateResponseRequest,
    model: string,
): ReadableStream<Uint8Array<ArrayBuffer>> {
    const source = completion.responseStream as
        | ReadableStream<Uint8Array<ArrayBuffer>>
        | null
        | undefined;
    if (!source) {
        throw new Error("Chat provider returned an empty stream");
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const responseId = `resp_${crypto.randomUUID().replaceAll("-", "")}`;
    const createdAt = completion.created ?? Math.floor(Date.now() / 1000);
    const echoBase: JsonObject = {
        id: responseId,
        object: "response",
        created_at: createdAt,
        model,
        previous_response_id: null,
        instructions: request.instructions ?? null,
        tools: request.tools ?? [],
        tool_choice: request.tool_choice ?? "auto",
        truncation: "disabled",
        parallel_tool_calls: request.parallel_tool_calls ?? true,
        text: { format: request.text?.format ?? { type: "text" } },
        top_p: request.top_p ?? 1,
        presence_penalty: request.presence_penalty ?? 0,
        frequency_penalty: request.frequency_penalty ?? 0,
        temperature: request.temperature ?? 1,
        reasoning: request.reasoning
            ? { ...request.reasoning, summary: null }
            : null,
        max_output_tokens: request.max_output_tokens ?? null,
        max_tool_calls: null,
        store: false,
        background: false,
        service_tier: request.service_tier ?? "default",
        metadata: request.metadata ?? {},
        safety_identifier: request.safety_identifier ?? null,
        prompt_cache_key: request.prompt_cache_key ?? null,
    };

    let sequence = -1;
    const event = (type: string, payload: JsonObject): string => {
        sequence += 1;
        const data = JSON.stringify({
            type,
            sequence_number: sequence,
            ...payload,
        });
        return `event: ${type}\ndata: ${data}\n\n`;
    };

    // Message item state: content parts open lazily in first-seen order.
    let messageOpen = false;
    const parts: MessagePart[] = [];
    let reasoningOpen = false;
    let reasoningText = "";
    const toolCalls = new Map<number, ToolCallState>();
    let finishReason: string | null | undefined;
    let lastUsage: Record<string, unknown> | undefined;
    let failed: JsonObject | undefined;
    let terminalSent = false;

    const ensureMessage = (events: string[]): void => {
        if (messageOpen) return;
        messageOpen = true;
        events.push(
            event("response.output_item.added", {
                output_index: 0,
                item: {
                    id: "msg_0",
                    type: "message",
                    role: "assistant",
                    status: "in_progress",
                    content: [],
                },
            }),
        );
    };

    const openPart = (events: string[], part: MessagePart): number => {
        const contentIndex = parts.length;
        parts.push(part);
        events.push(
            event("response.content_part.added", {
                item_id: "msg_0",
                output_index: 0,
                content_index: contentIndex,
                part:
                    part.type === "output_text"
                        ? { type: "output_text", text: "" }
                        : { type: "refusal", refusal: "" },
            }),
        );
        return contentIndex;
    };

    const findPart = (type: MessagePart["type"]): MessagePart | undefined =>
        parts.find((part) => part.type === type);

    const partContent = (part: MessagePart): JsonObject =>
        part.type === "output_text"
            ? { type: "output_text", text: part.text }
            : { type: "refusal", refusal: part.text };

    const closeMessage = (events: string[]): void => {
        if (!messageOpen) return;
        messageOpen = false;
        for (const [index, part] of parts.entries()) {
            if (part.type === "output_text") {
                events.push(
                    event("response.output_text.done", {
                        item_id: "msg_0",
                        output_index: 0,
                        content_index: index,
                        text: part.text,
                    }),
                );
            } else {
                events.push(
                    event("response.refusal.done", {
                        item_id: "msg_0",
                        output_index: 0,
                        content_index: index,
                        refusal: part.text,
                    }),
                );
            }
            events.push(
                event("response.content_part.done", {
                    item_id: "msg_0",
                    output_index: 0,
                    content_index: index,
                    part: partContent(part),
                }),
            );
        }
        events.push(
            event("response.output_item.done", {
                output_index: 0,
                item: {
                    id: "msg_0",
                    type: "message",
                    role: "assistant",
                    status: "completed",
                    content: parts.map(partContent),
                },
            }),
        );
    };

    const ensureReasoning = (events: string[]): void => {
        if (reasoningOpen) return;
        reasoningOpen = true;
        events.push(
            event("response.output_item.added", {
                output_index: 1,
                item: {
                    id: "rs_0",
                    type: "reasoning",
                    status: "in_progress",
                    content: [],
                },
            }),
        );
    };

    const closeReasoning = (events: string[]): void => {
        if (!reasoningOpen) return;
        reasoningOpen = false;
        events.push(
            event("response.reasoning_text.done", {
                item_id: "rs_0",
                output_index: 1,
                text: reasoningText,
            }),
            event("response.output_item.done", {
                output_index: 1,
                item: {
                    id: "rs_0",
                    type: "reasoning",
                    status: "completed",
                    content: [{ type: "reasoning_text", text: reasoningText }],
                },
            }),
        );
    };

    const orderedToolCalls = (): [number, ToolCallState][] =>
        [...toolCalls.entries(), ...closedToolCalls.entries()].sort(
            (left, right) => left[0] - right[0],
        );
    // Closed calls move here so their items live on in the terminal response.
    const closedToolCalls = new Map<number, ToolCallState>();

    const closeToolCalls = (events: string[]): void => {
        for (const [index, call] of orderedToolCalls()) {
            events.push(
                event("response.function_call_arguments.done", {
                    item_id: `fc_${index}`,
                    output_index: 2 + index,
                    arguments: call.arguments,
                }),
                event("response.output_item.done", {
                    output_index: 2 + index,
                    item: {
                        id: `fc_${index}`,
                        type: "function_call",
                        status: "completed",
                        call_id: call.id,
                        name: call.name,
                        arguments: call.arguments,
                    },
                }),
            );
        }
        for (const [index, call] of toolCalls) {
            closedToolCalls.set(index, call);
        }
        toolCalls.clear();
    };

    const outputItems = (): JsonObject[] => {
        const items: JsonObject[] = [];
        if (parts.length) {
            items.push({
                id: "msg_0",
                type: "message",
                role: "assistant",
                status: "completed",
                content: parts.map(partContent),
            });
        }
        if (reasoningText) {
            items.push({
                id: "rs_0",
                type: "reasoning",
                status: "completed",
                content: [{ type: "reasoning_text", text: reasoningText }],
            });
        }
        for (const [index, call] of orderedToolCalls()) {
            items.push({
                id: `fc_${index}`,
                type: "function_call",
                status: "completed",
                call_id: call.id,
                name: call.name,
                arguments: call.arguments,
            });
        }
        return items;
    };

    const emitTerminal = (events: string[]): void => {
        if (terminalSent) return;
        terminalSent = true;
        // Capture the output before the close events clear the accumulators.
        const output = outputItems();
        closeMessage(events);
        closeReasoning(events);
        closeToolCalls(events);

        const incomplete =
            finishReason === "length" || finishReason === "content_filter";
        const type = failed
            ? "response.failed"
            : incomplete
              ? "response.incomplete"
              : "response.completed";
        const usage = lastUsage
            ? (chatUsageToResponseUsage(lastUsage) as JsonObject | null)
            : null;
        events.push(
            event(type, {
                response: {
                    ...echoBase,
                    status: failed
                        ? "failed"
                        : incomplete
                          ? "incomplete"
                          : "completed",
                    incomplete_details: incomplete
                        ? {
                              reason:
                                  finishReason === "length"
                                      ? "max_output_tokens"
                                      : "content_filter",
                          }
                        : null,
                    output,
                    ...(failed ? { error: failed } : { error: null }),
                    usage,
                },
            }),
        );
    };

    const handleChunk = (chunk: ChatChunk): string[] => {
        const events: string[] = [];
        if (chunk.error && typeof chunk.error === "object") {
            failed = chunk.error as JsonObject;
            emitTerminal(events);
            return events;
        }

        const usage = chunk.usage;
        if (
            usage &&
            typeof usage === "object" &&
            !Array.isArray(usage) &&
            ["prompt_tokens", "completion_tokens", "total_tokens"].some((key) =>
                Object.hasOwn(usage, key),
            )
        ) {
            lastUsage = usage as Record<string, unknown>;
        }

        const choices = Array.isArray(chunk.choices) ? chunk.choices : [];
        for (const raw of choices) {
            if (!raw || typeof raw !== "object") continue;
            const choice = raw as ChatChunkChoice;
            if (choice.finish_reason)
                finishReason = choice.finish_reason as string;
            const delta = (choice.delta ?? {}) as JsonObject;

            if (typeof delta.content === "string" && delta.content) {
                ensureMessage(events);
                let part = findPart("output_text");
                if (!part) {
                    part = { type: "output_text", text: "" };
                    openPart(events, part);
                }
                part.text += delta.content;
                events.push(
                    event("response.output_text.delta", {
                        item_id: "msg_0",
                        output_index: 0,
                        content_index: parts.indexOf(part),
                        delta: delta.content,
                    }),
                );
            }

            const reasoning = delta.reasoning_content ?? delta.reasoning;
            if (typeof reasoning === "string" && reasoning) {
                ensureReasoning(events);
                reasoningText += reasoning;
                events.push(
                    event("response.reasoning_text.delta", {
                        item_id: "rs_0",
                        output_index: 1,
                        delta: reasoning,
                    }),
                );
            }

            if (typeof delta.refusal === "string" && delta.refusal) {
                ensureMessage(events);
                let part = findPart("refusal");
                if (!part) {
                    part = { type: "refusal", text: "" };
                    openPart(events, part);
                }
                part.text += delta.refusal;
                events.push(
                    event("response.refusal.delta", {
                        item_id: "msg_0",
                        output_index: 0,
                        content_index: parts.indexOf(part),
                        delta: delta.refusal,
                    }),
                );
            }

            if (Array.isArray(delta.tool_calls)) {
                for (const rawCall of delta.tool_calls) {
                    if (!rawCall || typeof rawCall !== "object") continue;
                    const call = rawCall as JsonObject;
                    const fn = (call.function ?? {}) as JsonObject;
                    const index =
                        typeof call.index === "number" ? call.index : 0;
                    let state = toolCalls.get(index);
                    if (!state) {
                        state = {
                            id:
                                typeof call.id === "string"
                                    ? call.id
                                    : `call_${index}`,
                            name: typeof fn.name === "string" ? fn.name : "",
                            arguments: "",
                        };
                        toolCalls.set(index, state);
                        events.push(
                            event("response.output_item.added", {
                                output_index: 2 + index,
                                item: {
                                    id: `fc_${index}`,
                                    type: "function_call",
                                    status: "in_progress",
                                    call_id: state.id,
                                    name: state.name,
                                    arguments: "",
                                },
                            }),
                        );
                    }
                    const args =
                        typeof fn.arguments === "string" ? fn.arguments : "";
                    if (args) {
                        state.arguments += args;
                        events.push(
                            event("response.function_call_arguments.delta", {
                                item_id: `fc_${index}`,
                                output_index: 2 + index,
                                delta: args,
                            }),
                        );
                    }
                }
            }
        }

        if (finishReason) {
            closeMessage(events);
            closeReasoning(events);
            closeToolCalls(events);
        }
        return events;
    };

    // The parser enqueues synchronously while feeding, so translated events
    // are buffered here and flushed to the controller after each source chunk.
    const pending: string[] = [];
    const parser = createParser({
        onEvent(message) {
            const data = message.data.trim();
            if (data === "[DONE]") {
                emitTerminal(pending);
                return;
            }
            let chunk: unknown;
            try {
                chunk = JSON.parse(data);
            } catch {
                return;
            }
            if (!chunk || typeof chunk !== "object") return;
            pending.push(...handleChunk(chunk as ChatChunk));
        },
    });

    const snapshot = (type: string): string =>
        event(type, {
            response: {
                ...echoBase,
                status: "in_progress",
                incomplete_details: null,
                output: [],
                error: null,
                usage: null,
            },
        });

    return source.pipeThrough(
        new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>({
            start(controller) {
                controller.enqueue(
                    encoder.encode(snapshot("response.created")),
                );
                controller.enqueue(
                    encoder.encode(snapshot("response.in_progress")),
                );
            },
            transform(chunk, controller) {
                parser.feed(decoder.decode(chunk, { stream: true }));
                for (const encoded of pending.splice(0)) {
                    controller.enqueue(encoder.encode(encoded));
                }
            },
            flush(controller) {
                parser.feed(`${decoder.decode()}\n\n`);
                for (const encoded of pending.splice(0)) {
                    controller.enqueue(encoder.encode(encoded));
                }
                const events: string[] = [];
                emitTerminal(events);
                for (const encoded of events) {
                    controller.enqueue(encoder.encode(encoded));
                }
            },
        }),
    );
}
