import { CHAT_USAGE_MISSING_AT_DONE_MESSAGE } from "./chat/usage.ts";

// How a text stream went, in a form that fits one analytics column.
export type StreamSummary = {
    chunks: number;
    contentChars: number;
    reasoningChars: number;
    finishReason: string | null;
    doneSeen: boolean;
};

export function createStreamSummary(): StreamSummary {
    return {
        chunks: 0,
        contentChars: 0,
        reasoningChars: 0,
        finishReason: null,
        doneSeen: false,
    };
}

export function summarizeChunk(event: unknown, summary: StreamSummary): void {
    summary.chunks += 1;
    const chunk = event as {
        choices?: unknown;
        error?: { code?: unknown; message?: unknown };
    } | null;
    // The usage validator swallows the provider's [DONE] when it fails there;
    // its error event is the only record that the sentinel arrived.
    if (
        chunk?.error?.code === "usage_missing" &&
        chunk.error.message === CHAT_USAGE_MISSING_AT_DONE_MESSAGE
    ) {
        summary.doneSeen = true;
    }
    if (!Array.isArray(chunk?.choices)) return;
    for (const choice of chunk.choices as {
        delta?: { content?: unknown; reasoning_content?: unknown };
        finish_reason?: unknown;
    }[]) {
        const delta = choice?.delta;
        if (typeof delta?.content === "string") {
            summary.contentChars += delta.content.length;
        }
        if (typeof delta?.reasoning_content === "string") {
            summary.reasoningChars += delta.reasoning_content.length;
        }
        if (typeof choice?.finish_reason === "string") {
            summary.finishReason = choice.finish_reason;
        }
    }
}

// A failed stream is explained by its end, not its first 16 KB of deltas: log
// the opening chunks plus the tail, and let the summary account for the rest.
const LOGGED_STREAM_HEAD = 2;
const LOGGED_STREAM_TAIL = 30;

export function trimStreamEvents(output: unknown): unknown {
    const streamEvents = (output as { streamEvents?: unknown } | null)
        ?.streamEvents;
    if (
        !Array.isArray(streamEvents) ||
        streamEvents.length <= LOGGED_STREAM_HEAD + LOGGED_STREAM_TAIL
    ) {
        return output;
    }
    return {
        ...(output as object),
        streamEvents: [
            ...streamEvents.slice(0, LOGGED_STREAM_HEAD),
            ...streamEvents.slice(-LOGGED_STREAM_TAIL),
        ],
    };
}
