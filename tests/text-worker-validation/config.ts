/**
 * Text Worker validation test configuration.
 *
 * Required environment variables:
 *   ENTER_TOKEN     — PLN_ENTER_TOKEN value
 *
 * Optional:
 *   TEXT_WORKER_URL  — text service base URL (defaults to myceli.ai staging)
 */

export const TEXT_URL =
    process.env.TEXT_WORKER_URL ||
    "https://text-pollinations.elliot-b6e.workers.dev";

const ENTER_TOKEN = process.env.ENTER_TOKEN;

if (!ENTER_TOKEN) {
    throw new Error(
        "Missing required env var: ENTER_TOKEN must be set",
    );
}

/** Standard headers for text Worker requests. */
export function textHeaders(extra: Record<string, string> = {}) {
    return {
        "x-enter-token": ENTER_TOKEN,
        "Content-Type": "application/json",
        ...extra,
    };
}
