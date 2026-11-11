import { createParser } from "eventsource-parser";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_BASE_URL } from "../client.js";
import { pollinationsErrorFromResponse } from "../error-response.js";
import { PollinationsError } from "../types.js";
import { useAuth } from "./hooks.js";

/** A `useChat` message. Structural, so the optional `ai` peer is not imported. */
export interface ChatMessage {
    role: string;
    parts: { type: string; text?: string }[];
    metadata?: unknown;
}

/** The UI message chunks this transport emits (a subset of `ai`'s `UIMessageChunk`). */
export type PollinationsChatChunk =
    | { type: "start" }
    | { type: "text-start" | "text-end"; id: string }
    | { type: "text-delta"; id: string; delta: string }
    | {
          type: "tool-input-available";
          toolCallId: string;
          toolName: string;
          input: unknown;
          dynamic: true;
          providerExecuted: true;
      }
    | {
          type: "tool-output-available";
          toolCallId: string;
          output: unknown;
          dynamic: true;
          providerExecuted: true;
      }
    | {
          type: "tool-output-error";
          toolCallId: string;
          errorText: string;
          dynamic: true;
          providerExecuted: true;
      }
    | { type: "error"; errorText: string }
    | {
          type: "finish";
          finishReason: "stop" | "length" | "content-filter";
          messageMetadata: { usage: unknown; output?: unknown[] };
      };

interface TransportSettings {
    apiKey: string | null;
    model?: string;
}

/** `/v1/responses` events this transport reads. */
type ResponsesEvent = {
    type?: string;
    item_id?: string;
    delta?: string;
    message?: string;
    item?: ResponseItem;
    response?: {
        usage?: unknown;
        output?: unknown[];
        error?: { message?: string } | null;
        incomplete_details?: { reason?: string } | null;
    };
};

type ResponseItem = {
    type?: string;
    call_id?: string;
    name?: string;
    arguments?: string;
    output?: string | { text?: string }[];
};

/** Result of a server-run MCP tool, as the agent stream encodes it. */
type ToolResult = { isError?: boolean; content?: { text?: string }[] };

function parseJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

/** Replay assistant output unchanged so later turns retain server tool results. */
function toResponsesInput(messages: ChatMessage[]): unknown[] {
    return messages.flatMap(({ role, parts, metadata }): unknown[] => {
        const output = (metadata as { output?: unknown[] } | undefined)?.output;
        if (role === "assistant" && output?.length) return output;
        const content = parts
            .map((part) => (part.type === "text" ? (part.text ?? "") : ""))
            .join("");
        return content ? [{ role, content }] : [];
    });
}

/**
 * Tool chunks for one completed output item of a server-run MCP tool: the call
 * and its result. Caller-run functions are not supported and produce no chunks.
 */
function functionItemChunks(
    item: ResponseItem | undefined,
): PollinationsChatChunk[] {
    const toolCallId = item?.call_id ?? "";
    if (item?.type === "function_call") {
        if (!item.name?.startsWith("mcp__")) return [];
        return [
            {
                type: "tool-input-available",
                toolCallId,
                toolName: item.name,
                input: parseJson(item.arguments ?? "{}"),
                dynamic: true,
                providerExecuted: true,
            },
        ];
    }
    if (item?.type === "function_call_output") {
        const output = item.output;
        const text =
            typeof output === "string"
                ? output
                : (output ?? []).map((part) => part.text ?? "").join("");
        const result = parseJson(text) as ToolResult;
        if (result?.isError) {
            const errorText = (result.content ?? [])
                .map((part) => part.text ?? "")
                .join("\n");
            return [
                {
                    type: "tool-output-error",
                    toolCallId,
                    errorText: errorText || "Tool failed",
                    dynamic: true,
                    providerExecuted: true,
                },
            ];
        }
        return [
            {
                type: "tool-output-available",
                toolCallId,
                output: result,
                dynamic: true,
                providerExecuted: true,
            },
        ];
    }
    return [];
}

/**
 * Map one Responses event to UI chunks. `terminal` ends the stream. Gen sends
 * `error` and then `response.failed` for one failure, so only the first counts.
 */
function responseEventChunks(
    event: ResponsesEvent,
    openText: Set<string>,
): { chunks: PollinationsChatChunk[]; terminal: boolean } {
    switch (event.type) {
        // A refusal explains why the model did not answer; show it as text.
        case "response.refusal.delta":
        case "response.output_text.delta": {
            const id = event.item_id ?? "text";
            const chunks: PollinationsChatChunk[] = openText.has(id)
                ? []
                : [{ type: "text-start", id }];
            openText.add(id);
            chunks.push({ type: "text-delta", id, delta: event.delta ?? "" });
            return { chunks, terminal: false };
        }
        case "response.output_item.done":
            return { chunks: functionItemChunks(event.item), terminal: false };
        case "response.completed":
        case "response.incomplete": {
            const ends = [...openText].map(
                (id): PollinationsChatChunk => ({ type: "text-end", id }),
            );
            const contentFilter =
                event.response?.incomplete_details?.reason === "content_filter";
            const finishReason =
                event.type === "response.completed"
                    ? "stop"
                    : contentFilter
                      ? "content-filter"
                      : "length";
            return {
                chunks: [
                    ...ends,
                    {
                        type: "finish",
                        finishReason,
                        messageMetadata: {
                            usage: event.response?.usage ?? null,
                            output: event.response?.output,
                        },
                    },
                ],
                terminal: true,
            };
        }
        case "error":
            return {
                chunks: [
                    {
                        type: "error",
                        errorText: event.message ?? "Responses stream failed",
                    },
                ],
                terminal: true,
            };
        case "response.failed":
            return {
                chunks: [
                    {
                        type: "error",
                        errorText:
                            event.response?.error?.message ??
                            "Responses stream failed",
                    },
                ],
                terminal: true,
            };
        default:
            return { chunks: [], terminal: false };
    }
}

/** Read the SSE body into UI chunks. The request is aborted when the stream is cancelled. */
function responseChunks(
    body: ReadableStream<Uint8Array>,
    request: AbortController,
    release: () => void,
): ReadableStream<PollinationsChatChunk> {
    return new ReadableStream<PollinationsChatChunk>({
        async start(controller) {
            controller.enqueue({ type: "start" });
            const reader = body.getReader();
            const decoder = new TextDecoder();
            const openText = new Set<string>();
            let finished = false;
            const parser = createParser({
                onEvent({ data }) {
                    if (finished || data === "[DONE]") return;
                    const result = responseEventChunks(
                        JSON.parse(data) as ResponsesEvent,
                        openText,
                    );
                    for (const chunk of result.chunks)
                        controller.enqueue(chunk);
                    finished = result.terminal;
                },
            });
            try {
                while (!finished) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    parser.feed(decoder.decode(value, { stream: true }));
                }
                if (!finished) {
                    controller.enqueue({
                        type: "error",
                        errorText: "Responses stream ended before completion",
                    });
                }
                controller.close();
            } catch (err) {
                // Aborts surface as AbortError, which useChat treats as a stop.
                if (request.signal.aborted) throw err;
                controller.enqueue({
                    type: "error",
                    errorText: err instanceof Error ? err.message : String(err),
                });
                controller.close();
            } finally {
                await reader.cancel().catch(() => undefined);
                release();
            }
        },
        cancel() {
            request.abort();
        },
    });
}

/**
 * A `useChat` transport that streams `/v1/responses` from the browser. Each
 * send reads `readSettings()`, so the transport keeps its identity while the
 * key changes. `abort()` stops every stream still in flight.
 */
export function createResponsesTransport(
    readSettings: () => TransportSettings,
) {
    const inFlight = new Set<AbortController>();
    return {
        async sendMessages({
            messages,
            abortSignal,
            body,
        }: {
            messages: ChatMessage[];
            abortSignal?: AbortSignal;
            body?: object;
        }): Promise<ReadableStream<PollinationsChatChunk>> {
            abortSignal?.throwIfAborted();
            const { apiKey, model } = readSettings();
            if (!apiKey) {
                throw new PollinationsError(
                    "Log in to Pollinations to chat",
                    "API_KEY",
                    401,
                );
            }
            const request = new AbortController();
            const forwardAbort = () => request.abort();
            const release = () => {
                inFlight.delete(request);
                abortSignal?.removeEventListener("abort", forwardAbort);
            };
            inFlight.add(request);
            abortSignal?.addEventListener("abort", forwardAbort);
            try {
                const response = await fetch(
                    `${DEFAULT_BASE_URL}/v1/responses`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${apiKey}`,
                        },
                        body: JSON.stringify({
                            model,
                            ...body,
                            input: toResponsesInput(messages),
                            stream: true,
                        }),
                        signal: request.signal,
                    },
                );
                if (!response.ok) {
                    throw await pollinationsErrorFromResponse(response);
                }
                if (!response.body) {
                    throw new PollinationsError(
                        "Empty response stream",
                        "NO_BODY",
                        502,
                    );
                }
                return responseChunks(response.body, request, release);
            } catch (err) {
                release();
                throw err;
            }
        },
        abort() {
            for (const request of [...inFlight]) request.abort();
        },
        async reconnectToStream() {
            return null;
        },
    };
}

export type ResponsesTransport = ReturnType<typeof createResponsesTransport>;

/**
 * `useChat` transport that sends `/v1/responses` with the signed-in user's key.
 * Pass `model` to choose the text model. Sends fail until the user logs in,
 * and a key change or unmount aborts the streams still in flight.
 *
 * @example
 * ```tsx
 * const transport = usePollinationsChatTransport({ model: "openai" });
 * const chat = useChat({ transport });
 * ```
 */
export function usePollinationsChatTransport(
    options: { model?: string } = {},
): ResponsesTransport {
    const { apiKey } = useAuth();
    const { model } = options;
    const settings = useRef<TransportSettings>({ apiKey, model });
    useEffect(() => {
        settings.current = { apiKey, model };
    }, [apiKey, model]);
    const [transport] = useState(() =>
        createResponsesTransport(() => settings.current),
    );
    // A key change aborts the streams of the previous key.
    useEffect(() => () => transport.abort(), [apiKey, transport]);
    return transport;
}
