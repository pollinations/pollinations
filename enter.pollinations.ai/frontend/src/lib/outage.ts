import { useEffect, useRef, useSyncExternalStore } from "react";

/** How often outage notices retry. */
export const OUTAGE_RETRY_MS = 30_000;
// A path nobody asks for again stops counting after this long.
const FAILURE_TTL_MS = 3 * OUTAGE_RETRY_MS;

// Paths whose last answer was a 5xx or no answer at all, by failure time.
const failures = new Map<string, number>();
const listeners = new Set<() => void>();
let outage = false;
let pruneTimer: ReturnType<typeof setInterval> | undefined;

function update(): void {
    const now = Date.now();
    for (const [path, failedAt] of failures) {
        if (now - failedAt > FAILURE_TTL_MS) failures.delete(path);
    }
    const next = failures.size > 0;
    if (next && !pruneTimer) pruneTimer = setInterval(update, OUTAGE_RETRY_MS);
    if (!next && pruneTimer) {
        clearInterval(pruneTimer);
        pruneTimer = undefined;
    }
    if (next === outage) return;
    outage = next;
    for (const listener of listeners) listener();
}

/** Pollinations failed, not the request: no response (no status) or a 5xx. */
export function isOutageStatus(status: number | undefined): boolean {
    return status === undefined || status >= 500;
}

/**
 * fetch for Enter and gen calls: a 5xx or network failure marks an outage
 * until the same path answers again. 401 and 403 are answers.
 */
export async function trackedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
): Promise<Response> {
    const path = new URL(
        input instanceof Request ? input.url : input,
        window.location.href,
    ).pathname;
    try {
        const response = await fetch(input, init);
        if (isOutageStatus(response.status)) failures.set(path, Date.now());
        else failures.delete(path);
        return response;
    } catch (error) {
        if (!init?.signal?.aborted) failures.set(path, Date.now());
        throw error;
    } finally {
        update();
    }
}

/** True while a recent Enter or gen call failed with a 5xx or no response. */
export function useOutage(): boolean {
    return useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        () => outage,
        () => outage,
    );
}

/** Calls `retry` every OUTAGE_RETRY_MS while `active`. */
export function useOutageRetry(
    active: boolean,
    retry: (() => unknown) | undefined,
): void {
    const latest = useRef(retry);
    latest.current = retry;
    useEffect(() => {
        if (!active) return;
        const timer = setInterval(
            () => void latest.current?.(),
            OUTAGE_RETRY_MS,
        );
        return () => clearInterval(timer);
    }, [active]);
}
