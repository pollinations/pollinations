import { useEffect, useRef, useSyncExternalStore } from "react";

/** How often outage notices retry. */
export const OUTAGE_RETRY_MS = 30_000;
// A path nobody asks for again stops counting after this long.
const FAILURE_TTL_MS = 3 * OUTAGE_RETRY_MS;
// Gen account calls carry a token minted here; without one they get a 401.
const SESSION_TOKEN_PATH = "/api/session-token";

// Paths whose last answer was a 5xx or no answer at all, by failure time.
const failures = new Map<string, { failedAt: number; timeout: boolean }>();
const listeners = new Set<() => void>();
let pruneTimer: ReturnType<typeof setInterval> | undefined;

function update(): void {
    const now = Date.now();
    // Offline, nothing retries: failures stay until the reconnect retry.
    const offline = globalThis.navigator?.onLine === false;
    for (const [path, failure] of failures) {
        if (offline) failure.failedAt = now;
        else if (now - failure.failedAt > FAILURE_TTL_MS) failures.delete(path);
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

function relevantFailures(paths?: readonly string[]) {
    return [...failures].filter(
        ([path]) =>
            !paths ||
            paths.includes(path) ||
            (path === SESSION_TOKEN_PATH &&
                paths.some((p) => p.startsWith("/account/"))),
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
        if (isOutageStatus(response.status))
            failures.set(path, {
                failedAt: Date.now(),
                timeout: response.status === 504,
            });
        else failures.delete(path);
        return response;
    } catch (error) {
        // A timeout is no answer; any other abort is the page cancelling.
        // Offline counts too: the notice then says so and retries on reconnect.
        const signal = init?.signal;
        if (!signal?.aborted || signal.reason?.name === "TimeoutError") {
            failures.set(path, {
                failedAt: Date.now(),
                timeout: false,
            });
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
    const snapshot = () => relevantFailures(paths).length > 0;
    return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Only an HTTP 504 response uses the request-timeout message. */
export function useRequestTimeout(paths?: readonly string[]): boolean {
    const snapshot = () => {
        const relevant = relevantFailures(paths);
        return (
            relevant.length > 0 &&
            relevant.every(([, failure]) => failure.timeout)
        );
    };
    return useSyncExternalStore(subscribe, snapshot, snapshot);
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

type RetryRef = { current: (() => unknown) | undefined };
// Panels waiting out an outage, by resource: each tick retries a resource
// once, however many panels show it.
const retries = new Map<string, Set<RetryRef>>();
let retryTimer: ReturnType<typeof setInterval> | undefined;

function retryAll(): void {
    // Offline, a retry can only fail, and a page reload would leave the app
    // for the browser's error page. The online event retries instead.
    if (globalThis.navigator?.onLine === false) return;
    for (const refs of retries.values()) {
        const [ref] = refs;
        // A failed retry leaves the panel as it is until the next one.
        Promise.resolve(ref?.current?.()).catch(() => {});
    }
}

/**
 * Calls `retry` every OUTAGE_RETRY_MS while `active`. Panels with the same
 * `resource` share one call per tick.
 */
export function useOutageRetry(
    active: boolean,
    resource: string,
    retry: (() => unknown) | undefined,
): void {
    const latest = useRef(retry);
    latest.current = retry;
    useEffect(() => {
        if (!active) return;
        const refs = retries.get(resource) ?? new Set<RetryRef>();
        refs.add(latest);
        retries.set(resource, refs);
        if (!retryTimer) {
            retryTimer = setInterval(retryAll, OUTAGE_RETRY_MS);
            // Back online: retry now instead of at the next tick.
            globalThis.window?.addEventListener("online", retryAll);
        }
        return () => {
            refs.delete(latest);
            if (refs.size === 0) retries.delete(resource);
            if (retries.size === 0) {
                clearInterval(retryTimer);
                retryTimer = undefined;
                globalThis.window?.removeEventListener("online", retryAll);
            }
        };
    }, [active, resource]);
}
