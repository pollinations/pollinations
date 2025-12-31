/**
 * Wraps a promise factory with a timeout that creates and manages an AbortController internally.
 * The promise factory receives an AbortSignal that will be aborted when the timeout occurs.
 *
 * @param promiseFactory - Function that creates a promise and accepts an AbortSignal
 * @param timeoutMs - Timeout in milliseconds
 * @returns Promise that resolves/rejects with the original promise or timeout error
 *
 * @example
 * const response = await withTimeoutSignal(
 *   (signal) => fetch('/api/data', { signal }),
 *   30000
 * );
 */
export function withTimeoutSignal<T>(
    promiseFactory: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
): Promise<T> {
    const controller = new AbortController();

    const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
            controller.abort();
            reject(new Error(`Operation timed out after ${timeoutMs}ms`));
        }, timeoutMs);
    });

    const promise = promiseFactory(controller.signal);
    return Promise.race([promise, timeoutPromise]);
}

/**
 * Wraps any promise with a timeout using Promise.race.
 * Note: This does not cancel the underlying operation, only rejects the promise.
 *
 * @param promise - The promise to wrap with timeout
 * @param timeoutMs - Timeout in milliseconds
 * @returns Promise that resolves/rejects with the original promise or timeout error
 *
 * @example
 * const response = await withTimeout(
 *   fetch('/api/data'),
 *   30000
 * );
 */
export function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
            reject(new Error(`Operation timed out after ${timeoutMs}ms`));
        }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]);
}

export async function sleep(ms: number) {
    await new Promise<void>((resolve, _) => setTimeout(resolve, ms));
}
