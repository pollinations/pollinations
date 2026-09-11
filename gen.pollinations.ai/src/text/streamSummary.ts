import { CHAT_USAGE_MISSING_AT_DONE_MESSAGE } from "./chat/usage.ts";

// A failed stream is explained by its end, not its first 16 KB of deltas: log
// the opening chunks plus the tail, and say how many chunks there were.
const LOGGED_STREAM_HEAD = 2;
const LOGGED_STREAM_TAIL = 30;

// The usage validator swallows the provider's [DONE] when it fails there; its
// error event is the only record that the sentinel arrived.
function isUsageMissingAtDone(event: unknown): boolean {
    const error = (
        event as { error?: { code?: unknown; message?: unknown } } | null
    )?.error;
    return (
        error?.code === "usage_missing" &&
        error.message === CHAT_USAGE_MISSING_AT_DONE_MESSAGE
    );
}

export function summarizeStreamForLog(output: unknown): unknown {
    const { streamEvents, doneSeen } = (output ?? {}) as {
        streamEvents?: unknown;
        doneSeen?: boolean;
    };
    if (!Array.isArray(streamEvents)) return output;
    return {
        chunks: streamEvents.length,
        doneSeen: doneSeen === true || streamEvents.some(isUsageMissingAtDone),
        streamEvents:
            streamEvents.length > LOGGED_STREAM_HEAD + LOGGED_STREAM_TAIL
                ? [
                      ...streamEvents.slice(0, LOGGED_STREAM_HEAD),
                      ...streamEvents.slice(-LOGGED_STREAM_TAIL),
                  ]
                : streamEvents,
    };
}
