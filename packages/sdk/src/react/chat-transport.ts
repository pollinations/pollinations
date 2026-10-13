import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import { EventSourceParserStream } from "eventsource-parser/stream";
import { useEffect, useMemo, useRef } from "react";
import { pollinationsErrorFromResponse } from "../error-response.js";
import { useAuthState } from "./hooks.js";

/** A raw Responses output item. Later turns send it back unchanged. */
type OutputItem = { type: string; id?: string; [key: string]: unknown };

/** Token usage reported by `/v1/responses`. */
export interface ResponsesUsage {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    [key: string]: unknown;
}

export interface PolliChatMetadata {
    /** Usage of the finished reply. */
    usage?: ResponsesUsage | null;
    /** Output items of the finished reply, replayed as history next turn. */
    output?: OutputItem[];
}

export type PolliUIMessage = UIMessage<PolliChatMetadata>;

type Chunk = UIMessageChunk<PolliChatMetadata>;

interface ToolItem extends OutputItem {
    id: string;
    name: string;
    arguments: string;
    status?: string;
    output?: string | null;
    error?: { message?: string } | string | null;
}

type ResponseEvent =
    | { type: "response.output_text.delta"; item_id: string; delta: string }
    | {
          type: "response.output_item.added" | "response.output_item.done";
          item: OutputItem;
      }
    | {
          type: "response.completed" | "response.incomplete";
          response: { output?: OutputItem[]; usage?: ResponsesUsage | null };
      }
    | {
          type: "response.failed";
          response?: { error?: { message?: string } | null };
      }
    | { type: "error"; message?: string; error?: { message?: string } };

export interface PolliChatTransportOptions {
    /** The user's key. A function is read on every send. */
    apiKey: string | null | (() => string | null);
    /** Model or agent id sent as `model`. */
    model?: string;
    /** Extra `/v1/responses` body fields, e.g. `instructions` or `tools`. */
    body?: Record<string, unknown>;
    /** Defaults to https://gen.pollinations.ai. */
    baseUrl?: string;
}

const DEFAULT_BASE_URL = "https://gen.pollinations.ai";

function parseJson(text: string | null | undefined): unknown {
    if (text == null) return null;
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

function isTool(item: OutputItem): item is ToolItem {
    return item.type === "mcp_call" || item.type === "function_call";
}

function toolError(item: ToolItem): string | null {
    if (item.error)
        return typeof item.error === "string"
            ? item.error
            : (item.error.message ?? "Tool failed");
    return item.status === "failed" ? "Tool failed" : null;
}

function userContent(part: PolliUIMessage["parts"][number]): unknown[] {
    if (part.type === "text") return [{ type: "input_text", text: part.text }];
    if (part.type === "file" && part.mediaType.startsWith("image/"))
        return [{ type: "input_image", image_url: part.url, detail: "auto" }];
    return [];
}

/**
 * Responses `input` for a chat. User and system turns come from their text
 * and image parts; assistant turns replay the output items they produced,
 * or their text when they have none.
 */
export function toResponsesInput(messages: PolliUIMessage[]): unknown[] {
    return messages.flatMap((message): unknown[] => {
        if (message.role === "assistant" && message.metadata?.output) {
            return message.metadata.output;
        }
        if (message.role === "assistant") {
            const text = message.parts
                .flatMap((part) => (part.type === "text" ? [part.text] : []))
                .join("");
            return text
                ? [
                      {
                          role: "assistant",
                          content: [{ type: "output_text", text }],
                      },
                  ]
                : [];
        }
        const content = message.parts.flatMap(userContent);
        return content.length
            ? [{ type: "message", role: message.role, content }]
            : [];
    });
}

/** Map one Responses event to UI message chunks. */
function toChunks(event: ResponseEvent, openText: Set<string>): Chunk[] {
    const endText = (): Chunk[] => {
        const chunks = [...openText].map(
            (id): Chunk => ({ type: "text-end", id }),
        );
        openText.clear();
        return chunks;
    };
    switch (event.type) {
        case "response.output_text.delta": {
            const start: Chunk[] = openText.has(event.item_id)
                ? []
                : [{ type: "text-start", id: event.item_id }];
            openText.add(event.item_id);
            return [
                ...start,
                { type: "text-delta", id: event.item_id, delta: event.delta },
            ];
        }
        case "response.output_item.added":
            if (!isTool(event.item)) return [];
            return [
                ...endText(),
                {
                    type: "tool-input-available",
                    toolCallId: event.item.id,
                    toolName: event.item.name,
                    input: parseJson(event.item.arguments),
                    dynamic: true,
                    providerExecuted: event.item.type === "mcp_call",
                },
            ];
        case "response.output_item.done": {
            const item = event.item;
            if (item.type !== "mcp_call" || !isTool(item)) return [];
            const errorText = toolError(item);
            return [
                errorText
                    ? {
                          type: "tool-output-error",
                          toolCallId: item.id,
                          errorText,
                          dynamic: true,
                          providerExecuted: true,
                      }
                    : {
                          type: "tool-output-available",
                          toolCallId: item.id,
                          output: parseJson(item.output),
                          dynamic: true,
                          providerExecuted: true,
                      },
            ];
        }
        case "response.completed":
        case "response.incomplete":
            return [
                ...endText(),
                { type: "finish-step" },
                {
                    type: "finish",
                    finishReason:
                        event.type === "response.incomplete"
                            ? "length"
                            : "stop",
                    messageMetadata: {
                        usage: event.response.usage ?? null,
                        output: event.response.output ?? [],
                    },
                },
            ];
        case "response.failed":
            throw new Error(
                event.response?.error?.message ?? "The response failed",
            );
        case "error":
            throw new Error(
                event.message ?? event.error?.message ?? "The response failed",
            );
        default:
            return [];
    }
}

/**
 * Vercel AI SDK `ChatTransport` for `useChat`, streaming from the stateless
 * `/v1/responses` API straight from the browser. Text streams as text parts,
 * server-run MCP tools as dynamic tool parts with their results, caller tools
 * as tool calls, failures as errors, and usage as message metadata.
 */
export function polliChatTransport(
    options: PolliChatTransportOptions,
): ChatTransport<PolliUIMessage> {
    const { model, body, baseUrl = DEFAULT_BASE_URL } = options;
    const url = `${baseUrl.replace(/\/+$/, "")}/v1/responses`;
    return {
        async sendMessages({ messages, abortSignal, headers, body: extra }) {
            const apiKey =
                typeof options.apiKey === "function"
                    ? options.apiKey()
                    : options.apiKey;
            if (!apiKey) throw new Error("Log in to Pollinations first");
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    ...headers,
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model,
                    ...body,
                    ...extra,
                    input: toResponsesInput(messages),
                    stream: true,
                    store: false,
                }),
                signal: abortSignal,
            });
            if (!response.ok)
                throw await pollinationsErrorFromResponse(response);
            if (!response.body) throw new Error("Empty response stream");

            const openText = new Set<string>();
            let finished = false;
            return response.body
                .pipeThrough(new TextDecoderStream())
                .pipeThrough(new EventSourceParserStream())
                .pipeThrough(
                    new TransformStream<{ data: string }, Chunk>({
                        start(controller) {
                            controller.enqueue({ type: "start" });
                            controller.enqueue({ type: "start-step" });
                        },
                        transform({ data }, controller) {
                            if (data === "[DONE]") return;
                            const event = JSON.parse(data) as ResponseEvent;
                            for (const chunk of toChunks(event, openText)) {
                                if (chunk.type === "finish") finished = true;
                                controller.enqueue(chunk);
                            }
                        },
                        flush() {
                            if (!finished)
                                throw new Error(
                                    "The response stream ended early",
                                );
                        },
                    }),
                );
        },
        async reconnectToStream() {
            return null;
        },
    };
}

/**
 * `polliChatTransport` bound to the `<PolliProvider>` key. The transport is
 * stable for `useChat`; it reads the current key on every send, and a key
 * change or logout aborts a reply that is still streaming for the old key.
 */
export function usePolliChatTransport(
    options: Omit<PolliChatTransportOptions, "apiKey"> = {},
): ChatTransport<PolliUIMessage> {
    const { apiKey } = useAuthState();
    const keyRef = useRef(apiKey);
    const controllers = useRef(new Set<AbortController>());
    const { model, body, baseUrl } = options;

    useEffect(() => {
        keyRef.current = apiKey;
        const active = controllers.current;
        return () => {
            for (const controller of active) controller.abort();
            active.clear();
        };
    }, [apiKey]);

    return useMemo(() => {
        const transport = polliChatTransport({
            apiKey: () => keyRef.current,
            model,
            body,
            baseUrl,
        });
        return {
            ...transport,
            async sendMessages(request) {
                const controller = new AbortController();
                const abort = () => controller.abort();
                request.abortSignal?.addEventListener("abort", abort);
                controllers.current.add(controller);
                const done = () => {
                    controllers.current.delete(controller);
                    request.abortSignal?.removeEventListener("abort", abort);
                };
                try {
                    const stream = await transport.sendMessages({
                        ...request,
                        abortSignal: controller.signal,
                    });
                    return stream.pipeThrough(
                        new TransformStream<Chunk, Chunk>({ flush: done }),
                    );
                } catch (err) {
                    done();
                    throw err;
                }
            },
        };
    }, [model, body, baseUrl]);
}
