import { UpstreamError } from "@shared/error.ts";
import { CompletionUsageSchema } from "@shared/schemas/openai.ts";
import { createParser } from "eventsource-parser";
import type { ChatCompletion } from "../types.js";
import { validatedSSEStream } from "../validatedSSEStream.js";

export function requireChatCompletionUsage(completion: ChatCompletion): void {
    if (CompletionUsageSchema.safeParse(completion.usage).success) return;

    throw new UpstreamError(502, {
        message:
            "Chat Completions provider returned an invalid response or omitted usage",
        requestUrl: completion.upstreamRequestUrl,
    });
}

export class ChatUsageError extends Error {
    override readonly name = "ChatUsageError";
}

export function createChatStreamUsageValidator() {
    const decoder = new TextDecoder();
    let lastUsage: unknown;
    let doneSeen = false;
    let errorSeen = false;

    const parser = createParser({
        onEvent(message) {
            if (doneSeen) return;
            if (message.data.trim() === "[DONE]") {
                if (
                    !errorSeen &&
                    !CompletionUsageSchema.safeParse(lastUsage).success
                ) {
                    throw new ChatUsageError(
                        "Chat Completions provider returned invalid or omitted terminal usage",
                    );
                }
                doneSeen = true;
                return;
            }

            let event: unknown;
            try {
                event = JSON.parse(message.data);
            } catch {
                return;
            }
            if (!event || typeof event !== "object") return;
            const { usage, error } = event as {
                usage?: unknown;
                error?: unknown;
            };
            if (error && typeof error === "object") errorSeen = true;
            // Providers may send provisional counts; only the last update is final.
            if (usage !== null && usage !== undefined) lastUsage = usage;
        },
    });

    return {
        feed(chunk: Uint8Array) {
            parser.feed(decoder.decode(chunk, { stream: true }));
        },
        finish() {
            // Some compatible providers close after one newline instead of an
            // empty SSE separator. Flush that final event for validation only;
            // the client still receives the exact upstream bytes.
            parser.feed(`${decoder.decode()}\n\n`);
            parser.reset({ consume: true });
            if (!errorSeen && !doneSeen) {
                throw new ChatUsageError(
                    "Chat Completions provider ended without terminal usage",
                );
            }
        },
    };
}

function chatUsageErrorEvent(error: ChatUsageError): Uint8Array<ArrayBuffer> {
    return new TextEncoder().encode(
        `data: ${JSON.stringify({
            error: {
                message: error.message,
                type: "upstream_error",
                code: "usage_missing",
            },
        })}\n\n`,
    );
}

export function requireChatStreamUsage(
    body: ReadableStream<Uint8Array<ArrayBuffer>>,
): ReadableStream<Uint8Array<ArrayBuffer>> {
    return validatedSSEStream(
        body,
        createChatStreamUsageValidator(),
        (error) => {
            if (!(error instanceof ChatUsageError)) throw error;
            return chatUsageErrorEvent(error);
        },
    );
}
