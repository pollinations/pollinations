/**
 * ChatTransport for Vercel AI SDK `useChat` that talks to Pollinations
 * `/v1/responses` directly from the browser with the user's own Pollen key.
 *
 * The public Responses stream is untouched — conversion to AI SDK UI message
 * chunks happens client-side, after the fetch resolves.
 *
 * The returned object satisfies the `ChatTransport` interface from the `ai`
 * package (an optional peer — it is only needed where `useChat` runs, never
 * bundled here):
 *
 * ```tsx
 * import { useChat } from "@ai-sdk/react";
 * import { createResponsesChatTransport } from "@pollinations/sdk";
 *
 * const transport = createResponsesChatTransport({ apiKey });
 * const chat = useChat({ transport });
 * ```
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

export type UiMessagePart = {
    type: string;
    text?: string;
    [key: string]: unknown;
};

export type UiMessage = {
    id?: string;
    role: string;
    parts?: UiMessagePart[];
    content?: string | Array<{ type: string; text?: string }>;
};

export type UiMessageChunk = {
    type: string;
    [key: string]: unknown;
};

export type UiMessageStream = ReadableStream<UiMessageChunk>;

export type SendMessagesInput = {
    trigger?: "submit-message" | "regenerate-message";
    chatId?: string;
    messageId?: string | undefined;
    messages: UiMessage[];
    abortSignal?: AbortSignal | undefined;
    headers?: Record<string, string>;
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

/** Flatten AI SDK UI messages into Responses `input` items (text only). */
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

type ResponsesUsage = {
    input_tokens?: number;
    output_tokens?: number;
    [key: string]: unknown;
};

function readUsage(event: Record<string, unknown>): ResponsesUsage | null {
    const nested = (event.response as { usage?: unknown } | undefined)?.usage;
    const usage = nested ?? event.usage;
    if (usage && typeof usage === "object") {
        return usage as ResponsesUsage;
    }
    return null;
}

/**
 * Convert an OpenAI Responses SSE body into AI SDK UI message chunks
 * (`text-start` / `text-delta` / `text-end`, usage as `message-metadata`,
 * then `finish`). Emitted as stream objects, matching what `useChat`
 * consumes from a `ChatTransport`.
 */
export function responsesSseToUiMessageStream(
    source: ReadableStream<Uint8Array>,
): ReadableStream<UiMessageChunk> {
    const decoder = new TextDecoder();
    const textId = "pollinations-text";
    let buffer = "";
    let started = false;
    let usage: ResponsesUsage | null = null;

    const startText = (
        controller: ReadableStreamDefaultController<UiMessageChunk>,
    ) => {
        if (!started) {
            started = true;
            controller.enqueue({ type: "text-start", id: textId });
        }
    };

    return new ReadableStream<UiMessageChunk>({
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
                            startText(controller);
                            controller.enqueue({
                                type: "text-delta",
                                id: textId,
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
                            controller.enqueue({
                                type: "error",
                                errorText: message,
                            });
                        } else if (type === "response.completed") {
                            usage = readUsage(event);
                        }
                    }
                }
                if (started) {
                    controller.enqueue({ type: "text-end", id: textId });
                }
                if (usage) {
                    controller.enqueue({
                        type: "message-metadata",
                        messageMetadata: { usage },
                    });
                }
                controller.enqueue({ type: "finish" });
                controller.close();
            } catch (error) {
                controller.enqueue({
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

/**
 * Build a `ChatTransport`-compatible object for `useChat` backed by
 * `/v1/responses`. The key is resolved per request, so rotation just works.
 * Extra per-request headers/body from `useChat` are merged in (explicit body
 * wins over defaults).
 */
export function createResponsesChatTransport(
    options: ResponsesChatTransportOptions,
) {
    const api = options.api ?? "https://gen.pollinations.ai/v1/responses";
    const fetchImpl = options.fetch ?? fetch;

    return {
        async sendMessages({
            messages,
            abortSignal,
            headers,
            body,
        }: SendMessagesInput): Promise<ReadableStream<UiMessageChunk>> {
            const apiKey = await resolveApiKey(options.apiKey);
            const extraHeaders = await resolveHeaders(options.headers);
            const input = uiMessagesToResponsesInput(messages);
            const response = await fetchImpl(api, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                    ...extraHeaders,
                    ...headers,
                },
                body: JSON.stringify({
                    model: options.model,
                    stream: true,
                    input,
                    ...body,
                }),
                signal: abortSignal ?? undefined,
            });
            if (!response.ok || !response.body) {
                const text = await response.text().catch(() => "");
                throw new Error(
                    text || `Responses request failed with ${response.status}`,
                );
            }
            return responsesSseToUiMessageStream(response.body);
        },

        async reconnectToStream(): Promise<UiMessageStream | null> {
            return null;
        },
    };
}
