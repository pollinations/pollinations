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
    let validationError: ChatUsageError | undefined;

    const parser = createParser({
        onEvent(message) {
            if (message.data.trim() === "[DONE]") {
                doneSeen = true;
                if (!usageSeen) {
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
            parser.feed(decoder.decode());
            parser.reset({ consume: true });
            if (validationError) throw validationError;
            if (!doneSeen || !usageSeen) {
                throw new ChatUsageError(
                    "Chat Completions provider ended without terminal usage",
                );
            }
        },
    };
}

export function requireChatStreamUsage<Chunk extends Uint8Array>(
    body: ReadableStream<Chunk>,
): ReadableStream<Chunk> {
    const validator = createChatStreamUsageValidator();

    return body.pipeThrough(
        new TransformStream<Chunk, Chunk>({
            transform(chunk, controller) {
                validator.feed(chunk);
                controller.enqueue(chunk);
            },
            flush() {
                validator.finish();
            },
        }),
    );
}
