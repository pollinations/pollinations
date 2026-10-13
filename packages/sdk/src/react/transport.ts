import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import { Pollinations } from "../client.js";
import { PollinationsError, type ChatOptions, type Message } from "../types.js";
import { DEFAULT_GENERATION_BASE_URL } from "./generation.js";

/** Options for {@link PollinationsChatTransport}. */
export interface PollinationsChatTransportOptions {
    /** API key; defaults to the key from <PolliProvider> when using {@link createPollinationsTransport}. */
    apiKey?: string;
    /** Generation host. Defaults to `https://gen.pollinations.ai`. */
    baseUrl?: string;
    /** Text model forwarded to `/v1/chat/completions`. */
    model?: string;
    /** Extra chat options (temperature, tools, ...) forwarded with each request. */
    chatOptions?: Omit<ChatOptions, "stream" | "signal">;
}

type ChatRequestOptions = Parameters<
    ChatTransport<UIMessage>["sendMessages"]
>[0];

/** Flatten a UI message's text parts into a plain string. */
function textFromUIMessage(message: UIMessage): string {
    return message.parts
        .map((part) => (part.type === "text" ? part.text : ""))
        .join("");
}

/** Convert Vercel AI SDK UI messages into Pollinations chat messages. */
export function toChatMessages(messages: UIMessage[]): Message[] {
    return messages.map((message) => ({
        role: message.role,
        content: textFromUIMessage(message),
    }));
}

function createStreamId(): string {
    const cryptoObj = globalThis.crypto as Crypto | undefined;
    if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
        return cryptoObj.randomUUID();
    }
    return `text-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isCancellation(err: unknown): boolean {
    if (err instanceof PollinationsError) {
        return err.code === "CANCELLED" || err.status === 499;
    }
    return err instanceof Error && err.name === "AbortError";
}

function toChatStream(
    client: Pollinations,
    messages: Message[],
    options: Omit<ChatOptions, "stream">,
): ReadableStream<UIMessageChunk> {
    const textId = createStreamId();
    return new ReadableStream<UIMessageChunk>({
        async start(controller) {
            let started = false;
            try {
                for await (const chunk of client.chatStream(messages, options)) {
                    const delta = chunk.choices[0]?.delta?.content;
                    if (!delta) continue;
                    if (!started) {
                        controller.enqueue({ type: "text-start", id: textId });
                        started = true;
                    }
                    controller.enqueue({
                        type: "text-delta",
                        id: textId,
                        delta,
                    });
                }
                if (started) {
                    controller.enqueue({ type: "text-end", id: textId });
                }
                controller.enqueue({ type: "finish", finishReason: "stop" });
                controller.close();
            } catch (err) {
                if (options.signal?.aborted || isCancellation(err)) {
                    controller.enqueue({ type: "abort" });
                    controller.close();
                    return;
                }
                controller.enqueue({
                    type: "error",
                    errorText:
                        err instanceof Error ? err.message : String(err),
                });
                controller.close();
            }
        },
    });
}

/**
 * A {@link ChatTransport} that streams `/v1/chat/completions` from
 * gen.pollinations.ai, so `useChat` from the Vercel AI SDK can talk to
 * Pollinations with the logged-in user's key.
 *
 * @example
 * ```tsx
 * import { useChat } from "@ai-sdk/react";
 * import { createPollinationsTransport } from "@pollinations/sdk/react";
 *
 * const { messages, sendMessage } = useChat({
 *   transport: createPollinationsTransport({ apiKey, model: "openai" }),
 * });
 * ```
 */
export class PollinationsChatTransport<
    UI_MESSAGE extends UIMessage = UIMessage,
> implements ChatTransport<UI_MESSAGE>
{
    private readonly apiKey: string | undefined;
    private readonly baseUrl: string;
    private readonly chatOptions: Omit<ChatOptions, "stream" | "signal">;

    constructor(options: PollinationsChatTransportOptions = {}) {
        this.apiKey = options.apiKey;
        this.baseUrl = options.baseUrl ?? DEFAULT_GENERATION_BASE_URL;
        this.chatOptions = {
            ...(options.model ? { model: options.model } : {}),
            ...options.chatOptions,
        };
    }

    async sendMessages(
        options: ChatRequestOptions,
    ): Promise<ReadableStream<UIMessageChunk>> {
        const { messages, abortSignal, body } = options;
        const client = new Pollinations({
            apiKey: this.apiKey,
            baseUrl: this.baseUrl,
        });
        const extra =
            body && typeof body === "object"
                ? (body as Partial<Omit<ChatOptions, "stream" | "signal">>)
                : undefined;
        return toChatStream(client, toChatMessages(messages), {
            ...this.chatOptions,
            ...extra,
            signal: abortSignal,
        });
    }

    async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
        // Pollinations chat completions are not resumable.
        return null;
    }
}

/**
 * Create a {@link PollinationsChatTransport}. Prefer this over `new` so call
 * sites read the same at every generation hook.
 */
export function createPollinationsTransport<
    UI_MESSAGE extends UIMessage = UIMessage,
>(
    options: PollinationsChatTransportOptions = {},
): PollinationsChatTransport<UI_MESSAGE> {
    return new PollinationsChatTransport<UI_MESSAGE>(options);
}
