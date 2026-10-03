/**
 * ChatTransport for Vercel AI SDK `useChat` that talks to Pollinations
 * `/v1/responses` directly. Does not inject Vercel events into the public
 * Chat Completions or Responses streams — conversion happens client-side.
 *
 * Peer usage:
 *   import { useChat } from '@ai-sdk/react';
 *   import { createResponsesChatTransport } from '@pollinations/sdk';
 *   const transport = createResponsesChatTransport({ apiKey });
 *   const chat = useChat({ transport });
 */

export type ResponsesChatTransportOptions = {
    apiKey: string | (() => string | Promise<string>);
    /** Defaults to https://gen.pollinations.ai/v1/responses */
    api?: string;
    /** Model id forwarded on every request when the UI does not set one. */
    model?: string;
    headers?:
        | Record<string, string>
        | (() => Record<string, string> | Promise<Record<string, string>>);
    fetch?: typeof fetch;
};

type UiPart = {
    type: string;
    text?: string;
    [key: string]: unknown;
};

type UiMessage = {
    id?: string;
    role: string;
    parts?: UiPart[];
    content?: string | Array<{ type: string; text?: string }>;
};

export type SendMessagesInput = {
    messages: UiMessage[];
    abortSignal?: AbortSignal;
    body?: Record<string, unknown>;
};

function resolveApiKey(
    apiKey: ResponsesChatTransportOptions["apiKey"],
): Promise<string> {
    return Promise.resolve(typeof apiKey === "function" ? apiKey() : apiKey);
}

function resolveHeaders(
    headers: ResponsesChatTransportOptions["headers"],
): Promise<Record<string, string>> {
    if (!headers) return Promise.resolve({});
    return Promise.resolve(typeof headers === "function" ? headers() : headers);
}

/** Flatten AI SDK UI messages into Responses `input` items. */
export function uiMessagesToResponsesInput(
    messages: UiMessage[],
): Array<Record<string, unknown>> {
    const input: Array<Record<string, unknown>> = [];
    for (const message of messages) {
        const role = message.role === "assistant" ? "assistant" : "user";
        const texts: string[] = [];
        if (typeof message.content === "string") {
            texts.push(message.content);
        } else if (Array.isArray(message.content)) {
            for (const part of message.content) {
                if (part?.type === "text" && typeof part.text === "string") {
                    texts.push(part.text);
                }
            }
        }
        for (const part of message.parts ?? []) {
            if (part.type === "text" && typeof part.text === "string") {
                texts.push(part.text);
            }
            if (
                part.type === "tool-invocation" ||
                part.type === "tool-result" ||
                part.type.startsWith("tool-")
            ) {
            }
        }
        const text = texts.join("");
        if (!text) continue;
        input.push({
            role,
            content: [{ type: "input_text", text }],
        });
    }
    return input;
}

/**
 * Convert an OpenAI Responses SSE body into an AI SDK UI message stream
 * (text-delta / error / finish chunks as SSE `data:` JSON lines).
 */
export function responsesSseToUiMessageStream(
    source: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let buffer = "";
    let sawText = false;

    const enqueue = (
        controller: ReadableStreamDefaultController<Uint8Array>,
        chunk: Record<string, unknown>,
    ) => {
        controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
        );
    };

    return new ReadableStream<Uint8Array>({
        async start(controller) {
            const reader = source.getReader();
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const parts = buffer.split("\n");
                    buffer = parts.pop() ?? "";
                    for (const line of parts) {
                        const trimmed = line.trim();
                        if (!trimmed.startsWith("data:")) continue;
                        const payload = trimmed.slice(5).trim();
                        if (!payload || payload === "[DONE]") continue;
                        let event: Record<string, unknown>;
                        try {
                            event = JSON.parse(payload) as Record<
                                string,
                                unknown
                            >;
                        } catch {
                            continue;
                        }
                        const type = event.type;
                        if (
                            type === "response.output_text.delta" &&
                            typeof event.delta === "string"
                        ) {
                            sawText = true;
                            enqueue(controller, {
                                type: "text-delta",
                                id: "pollinations-text",
                                delta: event.delta,
                            });
                        } else if (
                            type === "error" ||
                            type === "response.failed"
                        ) {
                            const message =
                                (event.message as string | undefined) ||
                                (
                                    event.error as
                                        | { message?: string }
                                        | undefined
                                )?.message ||
                                "Responses stream failed";
                            enqueue(controller, {
                                type: "error",
                                errorText: message,
                            });
                        } else if (type === "response.completed") {
                            const usage =
                                (
                                    event.response as
                                        | { usage?: unknown }
                                        | undefined
                                )?.usage ?? event.usage;
                            enqueue(controller, {
                                type: "finish",
                                finishReason: "stop",
                                ...(usage ? { usage } : {}),
                            });
                        }
                    }
                }
                if (!sawText) {
                    // Non-stream JSON bodies are not expected here; still close cleanly.
                    enqueue(controller, {
                        type: "finish",
                        finishReason: "stop",
                    });
                }
                controller.close();
            } catch (error) {
                enqueue(controller, {
                    type: "error",
                    errorText:
                        error instanceof Error
                            ? error.message
                            : "Responses transport failed",
                });
                controller.close();
            }
        },
    });
}

export function createResponsesChatTransport(
    options: ResponsesChatTransportOptions,
) {
    const api = options.api ?? "https://gen.pollinations.ai/v1/responses";
    const fetchImpl = options.fetch ?? fetch;

    return {
        async sendMessages({
            messages,
            abortSignal,
            body,
        }: SendMessagesInput): Promise<ReadableStream<Uint8Array>> {
            const apiKey = await resolveApiKey(options.apiKey);
            const headers = await resolveHeaders(options.headers);
            const input = uiMessagesToResponsesInput(messages);
            const response = await fetchImpl(api, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                    ...headers,
                },
                body: JSON.stringify({
                    model: options.model,
                    stream: true,
                    input,
                    ...body,
                }),
                signal: abortSignal,
            });
            if (!response.ok || !response.body) {
                const text = await response.text().catch(() => "");
                throw new Error(
                    text || `Responses request failed with ${response.status}`,
                );
            }
            return responsesSseToUiMessageStream(response.body);
        },

        async reconnectToStream(): Promise<ReadableStream<Uint8Array> | null> {
            return null;
        },
    };
}
