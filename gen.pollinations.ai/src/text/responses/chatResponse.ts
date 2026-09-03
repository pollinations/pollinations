import {
    type ResponseUsage,
    ResponseUsageSchema,
} from "@shared/schemas/openai.ts";
import {
    type EventSourceMessage,
    EventSourceParserStream,
} from "eventsource-parser/stream";
import type { ChatCompletion, ChatMessage, ServiceError } from "../types.js";

type JsonObject = Record<string, unknown>;
type TextDeltaKind = "content" | "refusal" | "reasoning_content";

type ResponseItem = JsonObject & {
    type?: string;
    id?: string;
    call_id?: string;
    name?: string;
    arguments?: string;
    content?: JsonObject[];
    summary?: JsonObject[];
};

type ResponsesData = JsonObject & {
    id?: string;
    created_at?: number;
    model?: string;
    status?: string;
    incomplete_details?: { reason?: string };
    output?: ResponseItem[];
    usage?: unknown;
    error?: { message?: string; status?: number };
};

function serviceError(
    message: string,
    requestUrl: URL,
    details?: unknown,
): ServiceError {
    const error = new Error(message) as ServiceError;
    error.status = 502;
    error.requestUrl = requestUrl;
    error.details = details;
    return error;
}

function chatUsage(usage: ResponseUsage): JsonObject {
    const inputDetails = usage.input_tokens_details;
    const outputDetails = usage.output_tokens_details;
    return {
        prompt_tokens: usage.input_tokens,
        completion_tokens: usage.output_tokens,
        total_tokens: usage.total_tokens,
        ...(inputDetails
            ? {
                  prompt_tokens_details: {
                      cached_tokens: inputDetails.cached_tokens ?? 0,
                      cache_write_tokens: inputDetails.cache_write_tokens ?? 0,
                      audio_tokens: inputDetails.audio_tokens ?? 0,
                      image_tokens: inputDetails.image_tokens ?? 0,
                  },
              }
            : {}),
        ...(outputDetails
            ? {
                  completion_tokens_details: {
                      reasoning_tokens: outputDetails.reasoning_tokens ?? 0,
                      audio_tokens: outputDetails.audio_tokens ?? 0,
                      accepted_prediction_tokens:
                          outputDetails.accepted_prediction_tokens ?? 0,
                      rejected_prediction_tokens:
                          outputDetails.rejected_prediction_tokens ?? 0,
                  },
              }
            : {}),
    };
}

function finishReason(data: ResponsesData): string {
    if (data.status === "incomplete") {
        if (data.incomplete_details?.reason === "max_output_tokens") {
            return "length";
        }
        if (data.incomplete_details?.reason === "content_filter") {
            return "content_filter";
        }
        return "length";
    }
    if (data.output?.some((item) => item.type === "function_call")) {
        return "tool_calls";
    }
    return "stop";
}

function responseMessage(output: ResponseItem[], requestUrl: URL): ChatMessage {
    const text: string[] = [];
    const refusals: string[] = [];
    const reasoning: string[] = [];
    const toolCalls: JsonObject[] = [];

    for (const item of output) {
        if (item.type === "reasoning") {
            for (const part of [
                ...(item.summary ?? []),
                ...(item.content ?? []),
            ]) {
                if (typeof part.text === "string") reasoning.push(part.text);
            }
            continue;
        }
        if (item.type === "message") {
            for (const part of item.content ?? []) {
                if (
                    part.type === "output_text" &&
                    typeof part.text === "string"
                ) {
                    text.push(part.text);
                } else if (
                    part.type === "refusal" &&
                    typeof part.refusal === "string"
                ) {
                    refusals.push(part.refusal);
                }
            }
            continue;
        }
        if (item.type === "function_call") {
            if (
                typeof item.call_id !== "string" ||
                !item.call_id ||
                typeof item.name !== "string" ||
                !item.name ||
                typeof item.arguments !== "string"
            ) {
                throw serviceError(
                    "Responses provider returned a malformed function call",
                    requestUrl,
                    item,
                );
            }
            toolCalls.push({
                id: item.call_id,
                type: "function",
                function: {
                    name: item.name,
                    arguments: item.arguments,
                },
            });
        }
    }

    return {
        role: "assistant",
        content: text.length ? text.join("") : null,
        ...(refusals.length ? { refusal: refusals.join("") } : {}),
        ...(reasoning.length
            ? { reasoning_content: reasoning.join("\n") }
            : {}),
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
    };
}

export function responsesToChatCompletion(
    value: unknown,
    requestedModel: string,
    requestUrl: URL,
): ChatCompletion {
    if (!value || typeof value !== "object") {
        throw serviceError(
            "Responses provider returned invalid JSON",
            requestUrl,
        );
    }
    const data = value as ResponsesData;
    if (data.status === "failed" || data.error) {
        throw serviceError(
            data.error?.message ?? "Responses provider failed the request",
            requestUrl,
            data.error ?? data,
        );
    }
    if (
        !Array.isArray(data.output) ||
        !["completed", "incomplete"].includes(data.status ?? "")
    ) {
        throw serviceError(
            "Responses provider returned an invalid terminal response",
            requestUrl,
            data,
        );
    }
    const usage = ResponseUsageSchema.safeParse(data.usage);
    if (!usage.success) {
        throw serviceError(
            "Responses provider returned an invalid response or omitted usage",
            requestUrl,
        );
    }

    return withUpstreamRequestUrl(
        {
            id: data.id ?? `chatcmpl-${crypto.randomUUID()}`,
            object: "chat.completion",
            created: data.created_at ?? Math.floor(Date.now() / 1000),
            model: data.model ?? requestedModel,
            choices: [
                {
                    index: 0,
                    message: responseMessage(data.output, requestUrl),
                    finish_reason: finishReason(data),
                },
            ],
            usage: chatUsage(usage.data),
        },
        requestUrl,
    );
}

function dataEvent(value: unknown): Uint8Array<ArrayBuffer> {
    return new TextEncoder().encode(
        `data: ${typeof value === "string" ? value : JSON.stringify(value)}\n\n`,
    );
}

function withUpstreamRequestUrl(
    completion: ChatCompletion,
    requestUrl: URL,
): ChatCompletion {
    Object.defineProperty(completion, "upstreamRequestUrl", {
        value: requestUrl,
        enumerable: false,
        configurable: true,
        writable: true,
    });
    return completion;
}

export function responsesToChatStream(
    source: ReadableStream<Uint8Array<ArrayBuffer>>,
    requestedModel: string,
): ReadableStream<Uint8Array<ArrayBuffer>> {
    let id = `chatcmpl-${crypto.randomUUID()}`;
    let created = Math.floor(Date.now() / 1000);
    let model = requestedModel;
    let roleSent = false;
    let terminal = false;
    let nextToolIndex = 0;
    const toolIndexes = new Map<string, number>();
    const toolArgumentsSent = new Map<number, string>();
    const textSent: Record<TextDeltaKind, Map<string, string>> = {
        content: new Map(),
        refusal: new Map(),
        reasoning_content: new Map(),
    };

    const chunk = (delta: JsonObject, finishReason: string | null = null) =>
        dataEvent({
            id,
            object: "chat.completion.chunk",
            created,
            model,
            choices: [{ index: 0, delta, finish_reason: finishReason }],
            usage: null,
        });
    const ensureRole = (
        controller: TransformStreamDefaultController<Uint8Array<ArrayBuffer>>,
    ) => {
        if (roleSent) return;
        controller.enqueue(chunk({ role: "assistant", content: "" }));
        roleSent = true;
    };
    const fail = (
        controller: TransformStreamDefaultController<Uint8Array<ArrayBuffer>>,
        message: string,
        code = "upstream_error",
    ) => {
        if (terminal) return;
        controller.enqueue(
            dataEvent({ error: { message, type: "upstream_error", code } }),
        );
        terminal = true;
    };
    const emitTextDelta = (
        controller: TransformStreamDefaultController<Uint8Array<ArrayBuffer>>,
        kind: TextDeltaKind,
        key: string,
        delta: string,
    ) => {
        if (!delta) return;
        ensureRole(controller);
        controller.enqueue(chunk({ [kind]: delta }));
        textSent[kind].set(key, (textSent[kind].get(key) ?? "") + delta);
    };
    const emitTextDone = (
        controller: TransformStreamDefaultController<Uint8Array<ArrayBuffer>>,
        kind: TextDeltaKind,
        key: string,
        full: unknown,
    ) => {
        if (typeof full !== "string") return;
        const sent = textSent[kind].get(key) ?? "";
        if (full.startsWith(sent)) {
            emitTextDelta(controller, kind, key, full.slice(sent.length));
        }
    };
    const addToolCall = (
        controller: TransformStreamDefaultController<Uint8Array<ArrayBuffer>>,
        item: ResponseItem,
        requireArguments = false,
    ): number | undefined => {
        if (
            typeof item.call_id !== "string" ||
            !item.call_id ||
            typeof item.name !== "string" ||
            !item.name ||
            ((requireArguments || item.arguments !== undefined) &&
                typeof item.arguments !== "string")
        ) {
            fail(
                controller,
                "Responses provider returned a malformed function call",
            );
            return undefined;
        }
        const known = [item.id, item.call_id]
            .filter((key): key is string => typeof key === "string")
            .map((key) => toolIndexes.get(key))
            .find((index) => index !== undefined);
        if (known !== undefined) return known;
        ensureRole(controller);
        const index = nextToolIndex++;
        if (item.id) toolIndexes.set(item.id, index);
        toolIndexes.set(item.call_id, index);
        const argumentsSent = item.arguments ?? "";
        toolArgumentsSent.set(index, argumentsSent);
        controller.enqueue(
            chunk({
                tool_calls: [
                    {
                        index,
                        id: item.call_id,
                        type: "function",
                        function: {
                            name: item.name,
                            arguments: argumentsSent,
                        },
                    },
                ],
            }),
        );
        return index;
    };
    const emitToolArgumentsDone = (
        controller: TransformStreamDefaultController<Uint8Array<ArrayBuffer>>,
        index: number | undefined,
        full: unknown,
    ) => {
        if (index === undefined || typeof full !== "string") return;
        const sent = toolArgumentsSent.get(index) ?? "";
        if (!full.startsWith(sent)) return;
        const delta = full.slice(sent.length);
        if (!delta) return;
        controller.enqueue(
            chunk({
                tool_calls: [{ index, function: { arguments: delta } }],
            }),
        );
        toolArgumentsSent.set(index, full);
    };
    return source
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(
            new TransformStream<string, string>({
                transform(data, controller) {
                    controller.enqueue(data);
                },
                flush(controller) {
                    controller.enqueue("\n\n");
                },
            }),
        )
        .pipeThrough(new EventSourceParserStream())
        .pipeThrough(
            new TransformStream<EventSourceMessage, Uint8Array<ArrayBuffer>>({
                transform(event, controller) {
                    if (terminal || event.data === "[DONE]") return;
                    let payload: JsonObject;
                    try {
                        payload = JSON.parse(event.data) as JsonObject;
                    } catch {
                        if (event.event?.startsWith("response.")) {
                            fail(
                                controller,
                                "Responses provider returned malformed SSE",
                            );
                        }
                        return;
                    }
                    const type =
                        typeof payload.type === "string"
                            ? payload.type
                            : event.event;

                    if (type === "response.created") {
                        const response = (payload.response ??
                            {}) as ResponsesData;
                        id = response.id ?? id;
                        created = response.created_at ?? created;
                        model = response.model ?? model;
                        ensureRole(controller);
                        return;
                    }
                    if (type === "response.output_text.delta") {
                        if (typeof payload.delta === "string") {
                            emitTextDelta(
                                controller,
                                "content",
                                `${String(payload.item_id ?? "")}:${String(payload.content_index ?? 0)}`,
                                payload.delta,
                            );
                        }
                        return;
                    }
                    if (type === "response.output_text.done") {
                        emitTextDone(
                            controller,
                            "content",
                            `${String(payload.item_id ?? "")}:${String(payload.content_index ?? 0)}`,
                            payload.text,
                        );
                        return;
                    }
                    if (type === "response.refusal.delta") {
                        if (typeof payload.delta === "string") {
                            emitTextDelta(
                                controller,
                                "refusal",
                                `${String(payload.item_id ?? "")}:${String(payload.content_index ?? 0)}`,
                                payload.delta,
                            );
                        }
                        return;
                    }
                    if (type === "response.refusal.done") {
                        emitTextDone(
                            controller,
                            "refusal",
                            `${String(payload.item_id ?? "")}:${String(payload.content_index ?? 0)}`,
                            payload.refusal,
                        );
                        return;
                    }
                    if (
                        type === "response.reasoning_text.delta" ||
                        type === "response.reasoning_summary_text.delta"
                    ) {
                        if (typeof payload.delta === "string") {
                            const summary = type.includes("summary");
                            emitTextDelta(
                                controller,
                                "reasoning_content",
                                `${String(payload.item_id ?? "")}:${summary ? "s" : "r"}${String(summary ? (payload.summary_index ?? 0) : (payload.content_index ?? 0))}`,
                                payload.delta,
                            );
                        }
                        return;
                    }
                    if (
                        type === "response.reasoning_text.done" ||
                        type === "response.reasoning_summary_text.done"
                    ) {
                        const summary = type.includes("summary");
                        emitTextDone(
                            controller,
                            "reasoning_content",
                            `${String(payload.item_id ?? "")}:${summary ? "s" : "r"}${String(summary ? (payload.summary_index ?? 0) : (payload.content_index ?? 0))}`,
                            payload.text,
                        );
                        return;
                    }
                    if (type === "response.output_item.added") {
                        const item = (payload.item ?? {}) as ResponseItem;
                        if (item.type !== "function_call") return;
                        addToolCall(controller, item);
                        return;
                    }
                    if (type === "response.output_item.done") {
                        const item = (payload.item ?? {}) as ResponseItem;
                        if (item.type === "function_call") {
                            const index = addToolCall(controller, item, true);
                            emitToolArgumentsDone(
                                controller,
                                index,
                                item.arguments,
                            );
                        } else if (item.type === "message") {
                            for (const [index, part] of (
                                item.content ?? []
                            ).entries()) {
                                if (part.type === "output_text") {
                                    emitTextDone(
                                        controller,
                                        "content",
                                        `${item.id ?? ""}:${index}`,
                                        part.text,
                                    );
                                } else if (part.type === "refusal") {
                                    emitTextDone(
                                        controller,
                                        "refusal",
                                        `${item.id ?? ""}:${index}`,
                                        part.refusal,
                                    );
                                }
                            }
                        }
                        return;
                    }
                    if (type === "response.function_call_arguments.delta") {
                        if (typeof payload.delta !== "string") return;
                        const index = toolIndexes.get(
                            String(payload.item_id ?? payload.call_id ?? ""),
                        );
                        if (index === undefined) return;
                        toolArgumentsSent.set(
                            index,
                            (toolArgumentsSent.get(index) ?? "") +
                                payload.delta,
                        );
                        controller.enqueue(
                            chunk({
                                tool_calls: [
                                    {
                                        index,
                                        function: { arguments: payload.delta },
                                    },
                                ],
                            }),
                        );
                        return;
                    }
                    if (type === "response.function_call_arguments.done") {
                        const index = toolIndexes.get(
                            String(payload.item_id ?? payload.call_id ?? ""),
                        );
                        emitToolArgumentsDone(
                            controller,
                            index,
                            payload.arguments,
                        );
                        return;
                    }
                    if (type === "response.failed" || type === "error") {
                        const response = (payload.response ??
                            payload) as ResponsesData;
                        fail(
                            controller,
                            response.error?.message ??
                                "The model request failed",
                        );
                        return;
                    }
                    if (
                        type !== "response.completed" &&
                        type !== "response.incomplete"
                    ) {
                        return;
                    }

                    const response = (payload.response ?? {}) as ResponsesData;
                    const usage = ResponseUsageSchema.safeParse(response.usage);
                    if (!usage.success) {
                        fail(
                            controller,
                            "Responses provider omitted valid terminal usage",
                            "usage_missing",
                        );
                        return;
                    }
                    id = response.id ?? id;
                    created = response.created_at ?? created;
                    model = response.model ?? model;
                    const streamedMessage =
                        textSent.content.size > 0 || textSent.refusal.size > 0;
                    const streamedReasoning =
                        textSent.reasoning_content.size > 0;
                    for (const item of response.output ?? []) {
                        if (!item || typeof item !== "object") continue;
                        if (item.type === "function_call") {
                            const index = addToolCall(controller, item, true);
                            emitToolArgumentsDone(
                                controller,
                                index,
                                item.arguments,
                            );
                            if (terminal) return;
                            continue;
                        }
                        if (item.type === "message" && !streamedMessage) {
                            for (const [index, part] of (
                                item.content ?? []
                            ).entries()) {
                                if (part.type === "output_text") {
                                    emitTextDone(
                                        controller,
                                        "content",
                                        `${item.id ?? ""}:${index}`,
                                        part.text,
                                    );
                                } else if (part.type === "refusal") {
                                    emitTextDone(
                                        controller,
                                        "refusal",
                                        `${item.id ?? ""}:${index}`,
                                        part.refusal,
                                    );
                                }
                            }
                            continue;
                        }
                        if (item.type === "reasoning" && !streamedReasoning) {
                            for (const [index, part] of (
                                item.summary ?? []
                            ).entries()) {
                                emitTextDone(
                                    controller,
                                    "reasoning_content",
                                    `${item.id ?? ""}:s${index}`,
                                    part.text,
                                );
                            }
                            for (const [index, part] of (
                                item.content ?? []
                            ).entries()) {
                                emitTextDone(
                                    controller,
                                    "reasoning_content",
                                    `${item.id ?? ""}:r${index}`,
                                    part.text,
                                );
                            }
                        }
                    }
                    ensureRole(controller);
                    controller.enqueue(chunk({}, finishReason(response)));
                    controller.enqueue(
                        dataEvent({
                            id,
                            object: "chat.completion.chunk",
                            created,
                            model,
                            choices: [],
                            usage: chatUsage(usage.data),
                        }),
                    );
                    controller.enqueue(dataEvent("[DONE]"));
                    terminal = true;
                },
                flush(controller) {
                    if (!terminal) {
                        fail(
                            controller,
                            "Responses provider ended unexpectedly before completion",
                        );
                    }
                },
            }),
        );
}

export function streamingChatCompletion(
    source: ReadableStream<Uint8Array<ArrayBuffer>>,
    model: string,
    requestUrl: URL,
): ChatCompletion {
    return withUpstreamRequestUrl(
        {
            id: `chatcmpl-${crypto.randomUUID()}`,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model,
            stream: true,
            responseStream: responsesToChatStream(source, model),
            choices: [{ index: 0, delta: {}, finish_reason: null }],
        },
        requestUrl,
    );
}
