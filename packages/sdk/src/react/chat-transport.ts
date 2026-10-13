/**
 * A Vercel AI SDK `ChatTransport` that streams Pollinations `/v1/responses`
 * straight from the browser with the signed-in user's own Pollen key.
 *
 * `ai` stays an optional peer dependency: the transport and its chunk types are
 * structural, so importing this module never pulls the SDK in. Install `ai` and
 * `@ai-sdk/react` only where `useChat` runs.
 *
 * The public Responses stream is untouched — OpenAI Responses events are
 * converted to AI SDK UI message chunks client-side, after the fetch resolves.
 *
 * ```tsx
 * import { useChat } from "@ai-sdk/react";
 * import { usePollinationsTransport } from "@pollinations/sdk/react";
 *
 * const transport = usePollinationsTransport();
 * const chat = useChat({ transport });
 * ```
 */
import { createParser } from "eventsource-parser";
import { pollinationsErrorFromResponse } from "../error-response.js";

/** Generation origin. The account base URL used by the `useAccount*` hooks is a different host. */
export const DEFAULT_GENERATION_URL = "https://gen.pollinations.ai";

type Json = Record<string, unknown>;

/** One chunk on the AI SDK UI message stream (structural, so `ai` stays optional). */
export interface TransportChunk {
    type: string;
    [key: string]: unknown;
}

/** The subset of an AI SDK UI message part the transport reads. */
export interface TransportPart {
    type: string;
    text?: string;
    toolCallId?: string;
    toolName?: string;
    input?: unknown;
    output?: unknown;
    state?: string;
}

/** The subset of an AI SDK UI message the transport reads. */
export interface TransportMessage {
    id?: string;
    role: string;
    parts?: TransportPart[];
    content?: string;
}

/** What `useChat` hands a transport on every send. */
export interface SendMessagesOptions {
    messages: TransportMessage[];
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
    body?: Record<string, unknown>;
}

export interface PollinationsTransportOptions {
    /** The user's key, or a resolver read per request so key rotation just works. */
    apiKey: string | (() => string | Promise<string>);
    /** Generation origin. Defaults to `https://gen.pollinations.ai`. */
    baseUrl?: string;
    /** Model forwarded when the caller does not set one. */
    model?: string;
    headers?:
        | Record<string, string>
        | (() => Record<string, string> | Promise<Record<string, string>>);
    fetch?: typeof fetch;
}

function parseJson(value: unknown): unknown {
    if (typeof value !== "string" || value.length === 0) return {};
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

function toolErrorText(item: Json): string | null {
    const error = item.error;
    if (typeof error === "string") return error;
    if (error && typeof (error as Json).message === "string") {
        return String((error as Json).message);
    }
    return item.status === "failed" ? "Tool failed" : null;
}

function errorTextOf(event: Json): string {
    if (typeof event.message === "string" && event.message)
        return event.message;
    const error = event.error;
    if (typeof error === "string" && error) return error;
    if (error && typeof (error as Json).message === "string") {
        return String((error as Json).message);
    }
    const response = event.response as Json | undefined;
    const responseError = response?.error as Json | undefined;
    if (responseError && typeof responseError.message === "string") {
        return responseError.message;
    }
    return "Responses stream failed";
}

/**
 * Flatten AI SDK UI messages into Responses `input` items. Text becomes a
 * message item; a tool call replays as `function_call` plus, once it has a
 * result, `function_call_output` so the provider sees the output it produced.
 * The server rejects a result that does not follow its call.
 */
export function toResponsesInput(messages: TransportMessage[]): Json[] {
    const input: Json[] = [];
    for (const message of messages) {
        const role =
            message.role === "assistant"
                ? "assistant"
                : message.role === "system"
                  ? "system"
                  : "user";
        const textType = role === "assistant" ? "output_text" : "input_text";
        const content: Json[] = [];
        if (typeof message.content === "string" && message.content) {
            content.push({ type: textType, text: message.content });
        }
        const toolParts: TransportPart[] = [];
        for (const part of message.parts ?? []) {
            if (
                part.type === "text" &&
                typeof part.text === "string" &&
                part.text
            ) {
                content.push({ type: textType, text: part.text });
            } else if (
                part.type === "dynamic-tool" ||
                part.type.startsWith("tool-")
            ) {
                toolParts.push(part);
            }
        }
        if (content.length) input.push({ role, content });
        for (const part of toolParts) {
            const name =
                part.type === "dynamic-tool"
                    ? part.toolName
                    : part.type.slice("tool-".length);
            const callId = part.toolCallId;
            if (!name || !callId) continue;
            input.push({
                type: "function_call",
                call_id: callId,
                name,
                arguments: JSON.stringify(part.input ?? {}),
            });
            if (part.state === "output-available") {
                input.push({
                    type: "function_call_output",
                    call_id: callId,
                    output:
                        typeof part.output === "string"
                            ? part.output
                            : JSON.stringify(part.output ?? null),
                });
            }
        }
    }
    return input;
}

type TrackedTool = {
    callId: string;
    name: string;
    /** Set once the full argument string has been emitted as `tool-input-available`. */
    inputDone: boolean;
};

/**
 * Convert an OpenAI Responses SSE body into AI SDK UI message chunks.
 *
 * A `function_call` item is announced with empty `arguments`; its arguments
 * then arrive as `response.function_call_arguments.delta` and are closed by
 * `response.function_call_arguments.done`. Emitting `tool-input-available` on
 * the announcement alone would hand `useChat` an empty input, so the deltas are
 * accumulated and the input is published only when complete.
 */
export function responsesToChunks(
    body: ReadableStream<Uint8Array>,
): ReadableStream<TransportChunk> {
    const decoder = new TextDecoder();
    return new ReadableStream<TransportChunk>({
        start(controller) {
            let textId: string | null = null;
            let usage: Json | null = null;
            let finishReason = "stop";
            const tools = new Map<string, TrackedTool>();

            const endText = () => {
                if (textId === null) return;
                controller.enqueue({ type: "text-end", id: textId });
                textId = null;
            };
            const startText = (id: string) => {
                if (textId === id) return;
                endText();
                textId = id;
                controller.enqueue({ type: "text-start", id });
            };
            const track = (item: Json, callId: string, name: string) => {
                const key = typeof item.id === "string" ? item.id : callId;
                const existing = tools.get(key);
                if (existing) return existing;
                const tracked: TrackedTool = { callId, name, inputDone: false };
                tools.set(key, tracked);
                return tracked;
            };
            const publishInput = (
                tracked: TrackedTool,
                argumentsText: unknown,
            ) => {
                if (typeof argumentsText === "string" && argumentsText) {
                    controller.enqueue({
                        type: "tool-input-delta",
                        toolCallId: tracked.callId,
                        inputTextDelta: argumentsText,
                    });
                }
                controller.enqueue({
                    type: "tool-input-available",
                    toolCallId: tracked.callId,
                    toolName: tracked.name,
                    input: parseJson(argumentsText),
                    dynamic: true,
                });
                tracked.inputDone = true;
            };

            const handle = (event: Json) => {
                const type = typeof event.type === "string" ? event.type : "";
                switch (type) {
                    case "response.output_text.delta": {
                        const id =
                            typeof event.item_id === "string"
                                ? event.item_id
                                : "text";
                        startText(id);
                        controller.enqueue({
                            type: "text-delta",
                            id,
                            delta: String(event.delta ?? ""),
                        });
                        return;
                    }
                    case "response.function_call_arguments.delta": {
                        const tracked = tools.get(String(event.item_id ?? ""));
                        if (!tracked) return;
                        controller.enqueue({
                            type: "tool-input-delta",
                            toolCallId: tracked.callId,
                            inputTextDelta: String(event.delta ?? ""),
                        });
                        return;
                    }
                    case "response.function_call_arguments.done": {
                        const tracked = tools.get(String(event.item_id ?? ""));
                        if (!tracked) return;
                        controller.enqueue({
                            type: "tool-input-available",
                            toolCallId: tracked.callId,
                            toolName: tracked.name,
                            input: parseJson(event.arguments),
                            dynamic: true,
                        });
                        tracked.inputDone = true;
                        return;
                    }
                    case "response.output_item.added":
                    case "response.output_item.done": {
                        const item = event.item as Json | undefined;
                        if (!item || typeof item.type !== "string") return;
                        const callId =
                            typeof item.call_id === "string"
                                ? item.call_id
                                : typeof item.id === "string"
                                  ? item.id
                                  : undefined;
                        const name =
                            typeof item.name === "string"
                                ? item.name
                                : undefined;
                        if (!callId || !name) return;
                        if (item.type === "function_call") {
                            endText();
                            const tracked = track(item, callId, name);
                            if (type === "response.output_item.added") {
                                controller.enqueue({
                                    type: "tool-input-start",
                                    toolCallId: callId,
                                    toolName: name,
                                    dynamic: true,
                                });
                                // A replayed response carries the whole argument
                                // string here and never sends argument deltas.
                                if (
                                    !tracked.inputDone &&
                                    typeof item.arguments === "string" &&
                                    item.arguments
                                ) {
                                    publishInput(tracked, item.arguments);
                                }
                            } else if (!tracked.inputDone) {
                                publishInput(tracked, item.arguments);
                            }
                            return;
                        }
                        if (item.type === "mcp_call") {
                            endText();
                            const tracked = track(item, callId, name);
                            if (type === "response.output_item.added") {
                                controller.enqueue({
                                    type: "tool-input-available",
                                    toolCallId: callId,
                                    toolName: name,
                                    input: parseJson(item.arguments),
                                    dynamic: true,
                                    providerExecuted: true,
                                });
                                tracked.inputDone = true;
                                return;
                            }
                            const errorText = toolErrorText(item);
                            if (errorText) {
                                controller.enqueue({
                                    type: "tool-output-error",
                                    toolCallId: callId,
                                    errorText,
                                    dynamic: true,
                                    providerExecuted: true,
                                });
                            } else {
                                controller.enqueue({
                                    type: "tool-output-available",
                                    toolCallId: callId,
                                    output: parseJson(item.output),
                                    dynamic: true,
                                    providerExecuted: true,
                                });
                            }
                            return;
                        }
                        return;
                    }
                    case "response.completed":
                    case "response.incomplete": {
                        const response = event.response as Json | undefined;
                        usage =
                            (response?.usage as Json | undefined) ??
                            (event.usage as Json | undefined) ??
                            null;
                        finishReason =
                            type === "response.incomplete" ? "length" : "stop";
                        return;
                    }
                    case "response.failed": {
                        finishReason = "error";
                        controller.enqueue({
                            type: "error",
                            errorText: errorTextOf(event),
                        });
                        return;
                    }
                    case "error": {
                        finishReason = "error";
                        controller.enqueue({
                            type: "error",
                            errorText: errorTextOf(event),
                        });
                        return;
                    }
                    default:
                        return;
                }
            };

            const parser = createParser({
                onEvent: ({ data }) => {
                    if (!data || data === "[DONE]") return;
                    let event: Json;
                    try {
                        event = JSON.parse(data) as Json;
                    } catch {
                        return;
                    }
                    handle(event);
                },
            });

            const finish = () => {
                endText();
                controller.enqueue({
                    type: "finish",
                    finishReason,
                    ...(usage && { messageMetadata: { usage } }),
                });
                controller.close();
            };

            const reader = body.getReader();
            void (async () => {
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        parser.feed(decoder.decode(value, { stream: true }));
                    }
                    parser.feed(decoder.decode());
                    finish();
                } catch (error) {
                    controller.enqueue({
                        type: "error",
                        errorText:
                            error instanceof Error
                                ? error.message
                                : "Responses stream failed",
                    });
                    finish();
                } finally {
                    reader.releaseLock();
                }
            })();
        },
    });
}

/**
 * Build a `ChatTransport`-compatible object backed by `/v1/responses`. The key
 * is resolved per request, so rotation just works. Per-request headers and body
 * from `useChat` are merged in, with explicit values winning.
 */
export function pollinationsTransport(options: PollinationsTransportOptions) {
    const fetchImpl = options.fetch ?? fetch;
    const baseUrl = (options.baseUrl ?? DEFAULT_GENERATION_URL).replace(
        /\/+$/,
        "",
    );

    return {
        async sendMessages({
            messages,
            abortSignal,
            headers,
            body,
        }: SendMessagesOptions): Promise<ReadableStream<TransportChunk>> {
            const apiKey =
                typeof options.apiKey === "function"
                    ? await options.apiKey()
                    : options.apiKey;
            if (!apiKey) {
                throw new Error(
                    "A Pollinations API key is required. Use <PolliProvider> or pass apiKey.",
                );
            }
            const extraHeaders =
                typeof options.headers === "function"
                    ? await options.headers()
                    : options.headers;
            const response = await fetchImpl(`${baseUrl}/v1/responses`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                    ...extraHeaders,
                    ...headers,
                },
                body: JSON.stringify({
                    ...(options.model && { model: options.model }),
                    stream: true,
                    store: false,
                    input: toResponsesInput(messages),
                    ...body,
                }),
                signal: abortSignal,
            });
            if (!response.ok) {
                throw await pollinationsErrorFromResponse(response);
            }
            if (!response.body) {
                throw new Error("Responses request returned no body");
            }
            return responsesToChunks(response.body);
        },

        async reconnectToStream(): Promise<ReadableStream<TransportChunk> | null> {
            return null;
        },
    };
}
