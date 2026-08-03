import {
    type EventSourceMessage,
    EventSourceParserStream,
} from "eventsource-parser/stream";
import type { ChatCompletion, ServiceError, TransformFn } from "./types.js";

const RESPONSE_CONTROL_TOKENS = [
    "<|START_THINKING|>",
    "<|END_THINKING|>",
    "<|START_TEXT|>",
    "<|END_TEXT|>",
    "<|START_RESPONSE|>",
    "<|END_RESPONSE|>",
    "<|content_text|>",
    "<|content_thinking|>",
    "<|content_model_end_sampling|>",
    "<|end_message|>",
    "<|endoftext|>",
] as const;

function stripBoundaryControlTokens(
    text: string,
    boundary: "start" | "end",
): string {
    let cleaned = text;
    while (true) {
        const token = RESPONSE_CONTROL_TOKENS.find((value) =>
            boundary === "start"
                ? cleaned.startsWith(value)
                : cleaned.endsWith(value),
        );
        if (!token) return cleaned;
        cleaned =
            boundary === "start"
                ? cleaned.slice(token.length)
                : cleaned.slice(0, -token.length);
    }
}

function possibleTrailingControlLength(text: string): number {
    for (let index = 0; index < text.length; index += 1) {
        let remaining = text.slice(index);
        while (remaining) {
            const token = RESPONSE_CONTROL_TOKENS.find((value) =>
                remaining.startsWith(value),
            );
            if (!token) break;
            remaining = remaining.slice(token.length);
        }
        if (
            !remaining ||
            RESPONSE_CONTROL_TOKENS.some((value) => value.startsWith(remaining))
        ) {
            return text.length - index;
        }
    }
    return 0;
}

class FramedContentSanitizer {
    private pending = "";
    private atStart = true;

    push(text: string): string {
        this.pending += text;

        if (this.atStart) {
            this.pending = stripBoundaryControlTokens(this.pending, "start");
            if (!this.pending) return "";
            if (
                RESPONSE_CONTROL_TOKENS.some((token) =>
                    token.startsWith(this.pending),
                )
            ) {
                return "";
            }
            this.atStart = false;
        }

        const retainedLength = possibleTrailingControlLength(this.pending);
        const ready =
            retainedLength > 0
                ? this.pending.slice(0, -retainedLength)
                : this.pending;
        this.pending =
            retainedLength > 0 ? this.pending.slice(-retainedLength) : "";
        return ready;
    }

    finish(): string {
        let ready = this.pending;
        if (this.atStart) ready = stripBoundaryControlTokens(ready, "start");
        ready = stripBoundaryControlTokens(ready, "end");
        this.pending = "";
        this.atStart = false;
        return ready;
    }
}

function sanitizeContent(text: string): string {
    const sanitizer = new FramedContentSanitizer();
    return sanitizer.push(text) + sanitizer.finish();
}

function sanitizeStream(
    source: ReadableStream<Uint8Array<ArrayBuffer>>,
): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    const contentSanitizers = new Map<number, FramedContentSanitizer>();
    let lastChunkMetadata: Record<string, unknown> = {};

    function sanitizerFor(index: number): FramedContentSanitizer {
        const existing = contentSanitizers.get(index);
        if (existing) return existing;
        const sanitizer = new FramedContentSanitizer();
        contentSanitizers.set(index, sanitizer);
        return sanitizer;
    }

    function encodeEvent(event: EventSourceMessage, data = event.data) {
        const fields: string[] = [];
        if (event.event !== undefined) fields.push(`event: ${event.event}`);
        if (event.id !== undefined) fields.push(`id: ${event.id}`);
        for (const line of data.split("\n")) fields.push(`data: ${line}`);
        return encoder.encode(`${fields.join("\n")}\n\n`);
    }

    function flushPendingContent(): EventSourceMessage[] {
        const events: EventSourceMessage[] = [];
        for (const [index, sanitizer] of contentSanitizers) {
            const content = sanitizer.finish();
            if (!content) continue;
            events.push({
                data: JSON.stringify({
                    ...lastChunkMetadata,
                    choices: [
                        {
                            index,
                            delta: { content },
                            finish_reason: null,
                        },
                    ],
                }),
            });
        }
        contentSanitizers.clear();
        return events;
    }

    function sanitizeEvent(event: EventSourceMessage): EventSourceMessage[] {
        if (event.data === "[DONE]") {
            return [...flushPendingContent(), event];
        }

        let chunk: Record<string, unknown>;
        try {
            chunk = JSON.parse(event.data) as Record<string, unknown>;
        } catch {
            return [event];
        }

        const choices = Array.isArray(chunk.choices) ? chunk.choices : [];
        const { choices: _choices, ...metadata } = chunk;
        lastChunkMetadata = metadata;

        for (const [choicePosition, choiceValue] of choices.entries()) {
            if (!choiceValue || typeof choiceValue !== "object") continue;
            const choice = choiceValue as Record<string, unknown>;
            const index =
                typeof choice.index === "number"
                    ? choice.index
                    : choicePosition;
            const sanitizer = sanitizerFor(index);
            const delta =
                choice.delta && typeof choice.delta === "object"
                    ? (choice.delta as Record<string, unknown>)
                    : undefined;

            if (delta && typeof delta.content === "string") {
                delta.content = sanitizer.push(delta.content);
            }

            if (
                choice.finish_reason !== undefined &&
                choice.finish_reason !== null
            ) {
                const remaining = sanitizer.finish();
                if (remaining) {
                    choice.delta = {
                        ...delta,
                        content: `${
                            typeof delta?.content === "string"
                                ? delta.content
                                : ""
                        }${remaining}`,
                    };
                }
                contentSanitizers.delete(index);
            }
        }

        return [{ ...event, data: JSON.stringify(chunk) }];
    }

    return source
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(new EventSourceParserStream())
        .pipeThrough(
            new TransformStream<EventSourceMessage, Uint8Array>({
                transform(event, controller) {
                    for (const ready of sanitizeEvent(event)) {
                        controller.enqueue(encodeEvent(ready));
                    }
                },
                flush(controller) {
                    for (const ready of flushPendingContent()) {
                        controller.enqueue(encodeEvent(ready));
                    }
                },
            }),
        );
}

export function sanitizeFramedResponse(
    completion: ChatCompletion,
): ChatCompletion {
    if (completion.stream && completion.responseStream) {
        completion.responseStream = sanitizeStream(
            completion.responseStream as ReadableStream<
                Uint8Array<ArrayBuffer>
            >,
        );
        return completion;
    }

    for (const choice of completion.choices ?? []) {
        const message = choice.message;
        if (message && typeof message.content === "string") {
            message.content = sanitizeContent(message.content);
        }
    }
    return completion;
}

function rejectCohereRequest(message: string): never {
    const error = new Error(message) as ServiceError;
    error.status = 400;
    throw error;
}

export const validateCohereRequest: TransformFn = (messages, options) => {
    const hasNonTextInput = messages.some(
        (message) =>
            Array.isArray(message.content) &&
            message.content.some(
                (part) =>
                    !part ||
                    typeof part !== "object" ||
                    (part as { type?: unknown }).type !== "text",
            ),
    );
    if (hasNonTextInput) {
        rejectCohereRequest(
            "Cohere Command A+ on Azure supports text input only",
        );
    }

    if (
        options.tool_choice !== undefined &&
        options.tool_choice !== "auto" &&
        options.tool_choice !== "none"
    ) {
        rejectCohereRequest(
            'Cohere Command A+ on Azure supports tool_choice "auto" or "none" only',
        );
    }

    const normalizedOptions = { ...options };
    if (normalizedOptions.tool_choice === "none") {
        delete normalizedOptions.tools;
        delete normalizedOptions.tool_choice;
    }

    return { messages, options: normalizedOptions };
};
