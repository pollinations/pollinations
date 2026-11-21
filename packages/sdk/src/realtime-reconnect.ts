/**
 * Exponential backoff reconnection helper.
 *
 * Pure logic: takes an injectable `connect` function returning a promise.
 */

export interface ReconnectOptions {
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
    signal?: AbortSignal;
    onRetry?: (attempt: number, delay: number) => void;
}

export interface ReconnectResult<T> {
    value: T;
    attempts: number;
}

export class ReconnectError extends Error {
    attempts: number;
    constructor(message: string, attempts: number) {
        super(message);
        this.name = "ReconnectError";
        this.attempts = attempts;
    }
}

export async function reconnect<T>(
    connect: () => Promise<T>,
    options: ReconnectOptions = {},
): Promise<ReconnectResult<T>> {
    const maxRetries = options.maxRetries ?? 5;
    const baseDelay = options.baseDelay ?? 100;
    const maxDelay = options.maxDelay ?? 5000;
    const signal = options.signal;

    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        if (signal?.aborted) {
            throw new ReconnectError("Aborted", attempt);
        }
        try {
            const value = await connect();
            return { value, attempts: attempt + 1 };
        } catch (err) {
            attempt++;
            if (attempt > maxRetries) {
                throw new ReconnectError(
                    err instanceof Error ? err.message : String(err),
                    attempt,
                );
            }
            const delay = Math.min(baseDelay * 2 ** (attempt - 1), maxDelay);
            options.onRetry?.(attempt, delay);
            await sleep(delay, signal);
        }
    }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new ReconnectError("Aborted", 0));
            return;
        }
        const timer = setTimeout(resolve, ms);
        const onAbort = () => {
            clearTimeout(timer);
            reject(new ReconnectError("Aborted", 0));
        };
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}

export function createReconnector<T>(
    connect: () => Promise<T>,
    options: ReconnectOptions = {},
) {
    return () => reconnect(connect, options);
}
