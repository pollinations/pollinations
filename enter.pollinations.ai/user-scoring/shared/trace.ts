import { appendFileSync } from "node:fs";

/**
 * Append a timestamped JSON line to a trace file.
 * No-op if traceFile is null (tracing disabled).
 */
export function appendTrace(
    traceFile: string | null,
    payload: Record<string, unknown>,
): void {
    if (!traceFile) return;
    appendFileSync(
        traceFile,
        `${JSON.stringify({
            timestamp: new Date().toISOString(),
            ...payload,
        })}\n`,
    );
}
