export interface RetryOptions {
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
    backoffFactor?: number;
    retryableStatuses?: number[];
    retryableErrors?: string[];
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
    maxRetries: 3,
    baseDelay: 500,
    maxDelay: 10000,
    backoffFactor: 2,
    retryableStatuses: [429, 500, 502, 503, 504],
    retryableErrors: ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EPIPE"],
};

export async function withRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {},
): Promise<T> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    let lastError: Error | null = null;
    let delay = opts.baseDelay;

    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            // Check if we should retry
            const shouldRetry = isRetryableError(lastError, opts);
            if (!shouldRetry || attempt === opts.maxRetries) {
                throw lastError;
            }
            // Wait before retrying
            await sleep(delay);
            delay = Math.min(delay * opts.backoffFactor, opts.maxDelay);
        }
    }
    throw lastError;
}

function isRetryableError(error: Error, opts: Required<RetryOptions>): boolean {
    // Check for status code in error message (e.g., "429 Too Many Requests")
    const statusMatch = error.message.match(/^(\d{3})/);
    if (statusMatch) {
        const status = parseInt(statusMatch[1], 10);
        if (opts.retryableStatuses.includes(status)) {
            return true;
        }
    }
    // Check for network error codes
    if (error.message && opts.retryableErrors.some((e) => error.message.includes(e))) {
        return true;
    }
    return false;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}