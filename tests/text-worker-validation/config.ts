/**
 * Text Worker validation test configuration.
 *
 * Required environment variables:
 *   WORKER_PSK      — pre-shared key for Worker auth
 *   ENTER_TOKEN     — PLN_ENTER_TOKEN value
 *
 * Optional:
 *   TEXT_WORKER_URL  — text service base URL (defaults to myceli.ai staging)
 */

export const TEXT_URL =
    process.env.TEXT_WORKER_URL ||
    "https://text-pollinations.elliot-b6e.workers.dev";

const PSK = process.env.WORKER_PSK;
const ENTER_TOKEN = process.env.ENTER_TOKEN;

if (!PSK || !ENTER_TOKEN) {
    throw new Error(
        "Missing required env vars: WORKER_PSK and ENTER_TOKEN must be set",
    );
}

/** Standard headers for text Worker requests. */
export function textHeaders(extra: Record<string, string> = {}) {
    return {
        "x-proxy-psk": PSK,
        "x-enter-token": ENTER_TOKEN,
        "Content-Type": "application/json",
        ...extra,
    };
}
