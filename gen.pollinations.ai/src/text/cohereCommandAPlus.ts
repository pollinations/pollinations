import type { ChatCompletion, ServiceError, TransformFn } from "./types.js";

const COHERE_CONTROL_TOKENS = [
    "<|START_TEXT|>",
    "<|END_TEXT|>",
    "<|END_THINKING|>",
] as const;

function stripControlTokens(text: string): string {
    let cleaned = text;
    for (const token of COHERE_CONTROL_TOKENS) {
        cleaned = cleaned.replaceAll(token, "");
    }
    return cleaned;
}

function possibleTokenPrefixLength(text: string): number {
    let length = 0;
    for (const token of COHERE_CONTROL_TOKENS) {
        const maxPrefixLength = Math.min(text.length, token.length - 1);
        for (let index = maxPrefixLength; index > length; index -= 1) {
            if (text.endsWith(token.slice(0, index))) {
                length = index;
                break;
            }
        }
    }
    return length;
}

function sanitizeStream(
    source: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let pending = "";

    return source.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
                pending += decoder.decode(chunk, { stream: true });
                const retainedLength = possibleTokenPrefixLength(pending);
                const ready =
                    retainedLength > 0
                        ? pending.slice(0, -retainedLength)
                        : pending;
                pending =
                    retainedLength > 0 ? pending.slice(-retainedLength) : "";
                const cleaned = stripControlTokens(ready);
                if (cleaned) controller.enqueue(encoder.encode(cleaned));
            },
            flush(controller) {
                pending += decoder.decode();
                const cleaned = stripControlTokens(pending);
                if (cleaned) controller.enqueue(encoder.encode(cleaned));
            },
        }),
    );
}

export function sanitizeCohereResponse(
    completion: ChatCompletion,
): ChatCompletion {
    if (completion.stream && completion.responseStream) {
        completion.responseStream = sanitizeStream(
            completion.responseStream as ReadableStream<Uint8Array>,
        );
        return completion;
    }

    for (const choice of completion.choices ?? []) {
        const message = choice.message;
        if (message && typeof message.content === "string") {
            message.content = stripControlTokens(message.content);
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

    if (options.tool_choice !== undefined && options.tool_choice !== "auto") {
        const error = new Error(
            'Cohere Command A+ on Azure supports tool_choice "auto" only',
        ) as ServiceError;
        error.status = 400;
        throw error;
    }

    return { messages, options: { ...options } };
};
