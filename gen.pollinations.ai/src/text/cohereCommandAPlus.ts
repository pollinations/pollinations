import {
    type EventSourceMessage,
    EventSourceParserStream,
} from "eventsource-parser/stream";
import type { ChatCompletion, ServiceError, TransformFn } from "./types.js";

const COHERE_CONTROL_TOKENS = [
    "<|START_THINKING|>",
    "<|END_THINKING|>",
    "<|START_TEXT|>",
    "<|END_TEXT|>",
    "<|START_RESPONSE|>",
    "<|END_RESPONSE|>",
] as const;

function stripLeadingControlTokens(text: string): string {
    let cleaned = text;
    while (true) {
        const token = COHERE_CONTROL_TOKENS.find((value) =>
            cleaned.startsWith(value),
        );
        if (!token) return cleaned;
        cleaned = cleaned.slice(token.length);
    }
}

function stripTrailingControlTokens(text: string): string {
    let cleaned = text;
    while (true) {
        const token = COHERE_CONTROL_TOKENS.find((value) =>
            cleaned.endsWith(value),
        );
        if (!token) return cleaned;
        cleaned = cleaned.slice(0, -token.length);
    }
}

function isControlTokenSequenceOrPrefix(text: string): boolean {
    let remaining = text;
    while (remaining) {
        const token = COHERE_CONTROL_TOKENS.find((value) =>
            remaining.startsWith(value),
        );
        if (token) {
            remaining = remaining.slice(token.length);
            continue;
        }
        return COHERE_CONTROL_TOKENS.some((value) =>
            value.startsWith(remaining),
        );
    }
    return true;
}

function possibleTrailingControlLength(text: string): number {
    for (let index = 0; index < text.length; index += 1) {
        if (isControlTokenSequenceOrPrefix(text.slice(index))) {
            return text.length - index;
        }
    }
    return 0;
}

class CohereContentSanitizer {
    private pending = "";
    private atStart = true;

    push(text: string): string {
        this.pending += text;

        if (this.atStart) {
            this.pending = stripLeadingControlTokens(this.pending);
            if (!this.pending) return "";
            if (
                COHERE_CONTROL_TOKENS.some((token) =>
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
        if (this.atStart) ready = stripLeadingControlTokens(ready);
        ready = stripTrailingControlTokens(ready);
        this.pending = "";
        this.atStart = false;
        return ready;
    }
}

function sanitizeContent(text: string): string {
    const sanitizer = new CohereContentSanitizer();
    return sanitizer.push(text) + sanitizer.finish();
}

function serializeSseEvent(event: EventSourceMessage): string {
    return [
        ...(event.id !== undefined ? [`id: ${event.id}`] : []),
        ...(event.event !== undefined ? [`event: ${event.event}`] : []),
        ...event.data.split("\n").map((line) => `data: ${line}`),
        "",
        "",
    ].join("\n");
}

function sanitizeStream(
    source: ReadableStream<BufferSource>,
): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    const contentSanitizers = new Map<number, CohereContentSanitizer>();
    let lastChunkMetadata: Record<string, unknown> = {};

    function sanitizerFor(index: number): CohereContentSanitizer {
        const existing = contentSanitizers.get(index);
        if (existing) return existing;
        const sanitizer = new CohereContentSanitizer();
        contentSanitizers.set(index, sanitizer);
        return sanitizer;
    }

    function flushPendingContent(): string {
        let output = "";
        for (const [index, sanitizer] of contentSanitizers) {
            const content = sanitizer.finish();
            if (!content) continue;
            output += serializeSseEvent({
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
        return output;
    }

    function sanitizeEvent(event: EventSourceMessage): string {
        if (event.data === "[DONE]") {
            return flushPendingContent() + serializeSseEvent(event);
        }

        let chunk: Record<string, unknown>;
        try {
            chunk = JSON.parse(event.data) as Record<string, unknown>;
        } catch {
            return serializeSseEvent(event);
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

        return serializeSseEvent({ ...event, data: JSON.stringify(chunk) });
    }

    return source
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(new EventSourceParserStream())
        .pipeThrough(
            new TransformStream<EventSourceMessage, Uint8Array>({
                transform(event, controller) {
                    controller.enqueue(encoder.encode(sanitizeEvent(event)));
                },
                flush(controller) {
                    const remaining = flushPendingContent();
                    if (remaining)
                        controller.enqueue(encoder.encode(remaining));
                },
            }),
        );
}

export function sanitizeCohereResponse(
    completion: ChatCompletion,
): ChatCompletion {
    if (completion.stream && completion.responseStream) {
        completion.responseStream = sanitizeStream(
            completion.responseStream as ReadableStream<BufferSource>,
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
        const error = new Error(
            "Cohere Command A+ on Azure supports text input only",
        ) as ServiceError;
        error.status = 400;
        throw error;
    }

    if (
        options.tool_choice !== undefined &&
        options.tool_choice !== "auto" &&
        options.tool_choice !== "none"
    ) {
        const error = new Error(
            'Cohere Command A+ on Azure supports tool_choice "auto" or "none" only',
        ) as ServiceError;
        error.status = 400;
        throw error;
    }

    const normalizedOptions = { ...options };
    if (normalizedOptions.tool_choice === "none") {
        delete normalizedOptions.tools;
        delete normalizedOptions.tool_choice;
    }

    return { messages, options: normalizedOptions };
};
