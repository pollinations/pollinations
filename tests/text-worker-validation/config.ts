/**
 * Text Worker validation test configuration.
 *
 * Set environment variables to override defaults:
 *   TEXT_WORKER_URL  — text service base URL
 *   WORKER_PSK      — pre-shared key for Worker auth
 *   ENTER_TOKEN     — PLN_ENTER_TOKEN value
 */

export const TEXT_URL =
    process.env.TEXT_WORKER_URL ||
    "https://text-pollinations.elliot-b6e.workers.dev";

export const PSK =
    process.env.WORKER_PSK ||
    "62c964a740b3870d00ec9fad336d09166638e91d3e8f3a366b2bb67c464a9d12";

export const ENTER_TOKEN =
    process.env.ENTER_TOKEN || "LObKFt3SkykBxTKgmOxaxqN8XNjFiSKQQtVZJ6KL";

/** Standard headers for text Worker requests. */
export function textHeaders(extra: Record<string, string> = {}) {
    return {
        "x-proxy-psk": PSK,
        "x-enter-token": ENTER_TOKEN,
        "Content-Type": "application/json",
        ...extra,
    };
}
