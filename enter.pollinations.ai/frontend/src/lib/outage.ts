import { useEffect, useRef, useSyncExternalStore } from "react";

/** How often outage notices retry. */
export const OUTAGE_RETRY_MS = 30_000;
// A path nobody asks for again stops counting after this long.
const FAILURE_TTL_MS = 3 * OUTAGE_RETRY_MS;
// Gen account calls carry a token minted here; without one they get a 401.
const SESSION_TOKEN_PATH = "/api/session-token";

// Paths whose last answer was a 5xx or no answer at all, by failure time.
const failures = new Map<string, number>();
const listeners = new Set<() => void>();
let pruneTimer: ReturnType<typeof setInterval> | undefined;

function update(): void {
    const now = Date.now();
    for (const [path, failedAt] of failures) {
        if (now - failedAt > FAILURE_TTL_MS) failures.delete(path);
    }
    if (failures.size > 0 && !pruneTimer) {
        pruneTimer = setInterval(update, OUTAGE_RETRY_MS);
    }
    if (failures.size === 0 && pruneTimer) {
        clearInterval(pruneTimer);
        pruneTimer = undefined;
    }
    for (const listener of listeners) listener();
}

function failing(path: string): boolean {
    return (
        failures.has(path) ||
        (path.startsWith("/account/") && failures.has(SESSION_TOKEN_PATH))
    );
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
        globalThis.location?.href,
    ).pathname;
    try {
        const response = await fetch(input, init);
        if (isOutageStatus(response.status)) failures.set(path, Date.now());
        else failures.delete(path);
        return response;
    } catch (error) {
        // A timeout is no answer; any other abort is the page cancelling.
        const signal = init?.signal;
        if (!signal?.aborted || signal.reason?.name === "TimeoutError") {
            failures.set(path, Date.now());
        }
        throw error;
    } finally {
        update();
    }
}

/**
 * True while one of `paths` recently failed with a 5xx or no response, so a
 * panel shows the outage only for its own requests. Without `paths`, any
 * Enter or gen call counts.
 */
export function useOutage(paths?: readonly string[]): boolean {
    const snapshot = () => (paths ? paths.some(failing) : failures.size > 0);
    return useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        snapshot,
        snapshot,
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
        const timer = setInterval(() => {
            // A failed retry leaves the panel as it is until the next one.
            Promise.resolve(latest.current?.()).catch(() => {});
        }, OUTAGE_RETRY_MS);
        return () => clearInterval(timer);
    }, [active]);
}
