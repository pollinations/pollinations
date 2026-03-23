const MAX_RETRIES = 3;
const MIN_GAP_MS = 1000; // Minimum gap between API requests to avoid rate limits

/**
 * Helper to wait for a specified number of milliseconds
 */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Parse retryAfterSeconds from 429 error response
 */
function parseRetryAfter(errorText: string): number {
    try {
        const json = JSON.parse(errorText);
        return json.retryAfterSeconds || 15;
    } catch {
        return 15; // Default to 15 seconds if parsing fails
    }
}

// Serial queue — ensures API calls run one at a time with a gap between them
let lastRequestTime = 0;
let queueTail: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const task = queueTail.then(async () => {
        const now = Date.now();
        const wait = Math.max(0, MIN_GAP_MS - (now - lastRequestTime));
        if (wait > 0) await delay(wait);
        try {
            return await fn();
        } finally {
            lastRequestTime = Date.now();
        }
    });
    // Keep the chain going even if a task fails
    queueTail = task.catch(() => {});
    return task;
}

/**
 * Fetch with automatic retry on 429 rate limit errors.
 * Requests are serialized through a queue to respect rate limits.
 * Returns the Response object on success.
 */
export async function fetchWithRetry(
    url: string,
    options?: RequestInit,
): Promise<Response> {
    return enqueue(async () => {
        let lastError: Error | null = null;

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            const response = await fetch(url, options);

            if (response.ok) {
                return response;
            }

            const errorText = await response.text();

            if (response.status === 429 && attempt < MAX_RETRIES - 1) {
                const retryAfter = parseRetryAfter(errorText);
                console.log(
                    `⏳ Rate limited. Waiting ${retryAfter}s before retry ${attempt + 2}/${MAX_RETRIES}...`,
                );
                await delay(retryAfter * 1000 + 1000); // Add 1s buffer
                continue;
            }

            // For non-429 errors or final attempt, throw with details
            lastError = new Error(`HTTP ${response.status}: ${errorText}`);
        }

        throw lastError || new Error("Max retries exceeded");
    });
}
