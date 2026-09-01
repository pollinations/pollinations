import { createParser } from "eventsource-parser";
import { getResponsesEventUsage } from "./tracking.js";

const TERMINAL_EVENT_TYPES = new Set([
    "response.completed",
    "response.incomplete",
    "response.failed",
]);

export class ResponsesUsageError extends Error {
    override readonly name = "ResponsesUsageError";
}

function eventType(value: unknown): string | undefined {
    if (!value || typeof value !== "object") return undefined;
    const type = (value as { type?: unknown }).type;
    return typeof type === "string" ? type : undefined;
}

/**
 * Preserve upstream SSE bytes while making the client body fail if the
 * provider ends without a terminal Responses event containing valid usage.
 */
export function requireResponsesStreamUsage<Chunk extends Uint8Array>(
    body: ReadableStream<Chunk>,
): ReadableStream<Chunk> {
    const decoder = new TextDecoder();
    let terminalSeen = false;
    let validationError: ResponsesUsageError | undefined;

    const parser = createParser({
        onEvent(message) {
            let event: unknown;
            try {
                event = JSON.parse(message.data);
            } catch {
                if (message.event && TERMINAL_EVENT_TYPES.has(message.event)) {
                    validationError = new ResponsesUsageError(
                        "Responses provider returned a malformed terminal event",
                    );
                }
                return;
            }

            const type = eventType(event) ?? message.event;
            if (!type || !TERMINAL_EVENT_TYPES.has(type)) return;
            terminalSeen = true;

            const normalizedEvent =
                eventType(event) === type
                    ? event
                    : { ...(event as Record<string, unknown>), type };
            if (!getResponsesEventUsage(normalizedEvent)) {
                validationError = new ResponsesUsageError(
                    "Responses provider omitted valid terminal usage",
                );
            }
        },
    });

    return body.pipeThrough(
        new TransformStream<Chunk, Chunk>({
            transform(chunk, controller) {
                parser.feed(decoder.decode(chunk, { stream: true }));
                if (validationError) throw validationError;
                controller.enqueue(chunk);
            },
            flush() {
                parser.feed(decoder.decode());
                parser.reset({ consume: true });
                if (validationError) throw validationError;
                if (!terminalSeen) {
                    throw new ResponsesUsageError(
                        "Responses provider ended without a terminal usage event",
                    );
                }
            },
        }),
    );
}
