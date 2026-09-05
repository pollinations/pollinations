import { UpstreamError } from "@shared/error.ts";
import { CompletionUsageSchema } from "@shared/schemas/openai.ts";
import { createParser } from "eventsource-parser";
import type { ChatCompletion } from "../types.js";

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
    let usageSeen = false;
    let doneSeen = false;
    let errorSeen = false;
    let validationError: ChatUsageError | undefined;

    const parser = createParser({
        onEvent(message) {
            if (message.data.trim() === "[DONE]") {
                doneSeen = true;
                if (!usageSeen && !errorSeen) {
                    validationError = new ChatUsageError(
                        "Chat Completions provider omitted terminal usage",
                    );
                }
                return;
            }

            let event: unknown;
            try {
                event = JSON.parse(message.data);
            } catch {
                return;
            }
            if (!event || typeof event !== "object" || !("usage" in event)) {
                const error =
                    event && typeof event === "object"
                        ? (event as { error?: unknown }).error
                        : undefined;
                if (error && typeof error === "object") {
                    errorSeen = true;
                }
                return;
            }

            const usage = (event as { usage?: unknown }).usage;
            if (usage === null || usage === undefined) return;
            if (CompletionUsageSchema.safeParse(usage).success) {
                usageSeen = true;
            } else {
                validationError = new ChatUsageError(
                    "Chat Completions provider returned invalid terminal usage",
                );
            }
        },
    });

    return {
        feed(chunk: Uint8Array) {
            parser.feed(decoder.decode(chunk, { stream: true }));
            if (validationError) throw validationError;
        },
        finish() {
            // Some compatible providers close after one newline instead of an
            // empty SSE separator. Flush that final event for validation only;
            // the client still receives the exact upstream bytes.
            parser.feed(`${decoder.decode()}\n\n`);
            parser.reset({ consume: true });
            if (validationError) throw validationError;
            if (!errorSeen && (!doneSeen || !usageSeen)) {
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
    const validator = createChatStreamUsageValidator();

    return body.pipeThrough(
        new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>({
            transform(chunk, controller) {
                try {
                    validator.feed(chunk);
                    controller.enqueue(chunk);
                } catch (error) {
                    if (!(error instanceof ChatUsageError)) throw error;
                    controller.enqueue(chatUsageErrorEvent(error));
                    controller.terminate();
                }
            },
            flush(controller) {
                try {
                    validator.finish();
                } catch (error) {
                    if (!(error instanceof ChatUsageError)) throw error;
                    controller.enqueue(chatUsageErrorEvent(error));
                }
            },
        }),
    );
}
