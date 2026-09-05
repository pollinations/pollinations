import { createParser } from "eventsource-parser";
import { validatedSSEStream } from "../validatedSSEStream.js";
import {
    getResponsesEventUsage,
    normalizeResponsesTerminalEvent,
    RESPONSE_TERMINAL_EVENT_TYPES,
} from "./tracking.js";

export class ResponsesUsageError extends Error {
    override readonly name = "ResponsesUsageError";
}

function eventType(value: unknown): string | undefined {
    if (!value || typeof value !== "object") return undefined;
    const type = (value as { type?: unknown }).type;
    return typeof type === "string" ? type : undefined;
}

export function createResponsesStreamUsageValidator() {
    const decoder = new TextDecoder();
    let terminalSeen = false;
    let validationError: ResponsesUsageError | undefined;

    const parser = createParser({
        onEvent(message) {
            let event: unknown;
            try {
                event = JSON.parse(message.data);
            } catch {
                if (
                    message.event &&
                    RESPONSE_TERMINAL_EVENT_TYPES.has(message.event)
                ) {
                    validationError = new ResponsesUsageError(
                        "Responses provider returned a malformed terminal event",
                    );
                }
                return;
            }

            const type = eventType(event) ?? message.event;
            if (type === "error" || type === "response.failed") {
                terminalSeen = true;
                return;
            }
            if (!type || !RESPONSE_TERMINAL_EVENT_TYPES.has(type)) return;
            terminalSeen = true;

            const normalizedEvent = normalizeResponsesTerminalEvent(
                event,
                message.event,
            );
            if (!getResponsesEventUsage(normalizedEvent)) {
                validationError = new ResponsesUsageError(
                    "Responses provider omitted valid terminal usage",
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
            // Accept a final event closed by EOF instead of an empty SSE
            // separator without adding bytes to the client stream.
            parser.feed(`${decoder.decode()}\n\n`);
            parser.reset({ consume: true });
            if (validationError) throw validationError;
            if (!terminalSeen) {
                throw new ResponsesUsageError(
                    "Responses provider ended without a terminal usage event",
                );
            }
        },
    };
}

/**
 * Preserve valid upstream SSE bytes and end invalid streams with a Responses
 * error event when the provider omits terminal usage.
 */
function responsesUsageErrorEvent(
    error: ResponsesUsageError,
): Uint8Array<ArrayBuffer> {
    return new TextEncoder().encode(
        `event: error\ndata: ${JSON.stringify({
            type: "error",
            code: "usage_missing",
            message: error.message,
            param: null,
            sequence_number: 0,
        })}\n\n`,
    );
}

export function requireResponsesStreamUsage(
    body: ReadableStream<Uint8Array<ArrayBuffer>>,
): ReadableStream<Uint8Array<ArrayBuffer>> {
    return validatedSSEStream(
        body,
        createResponsesStreamUsageValidator(),
        (error) => {
            if (!(error instanceof ResponsesUsageError)) throw error;
            return responsesUsageErrorEvent(error);
        },
    );
}
