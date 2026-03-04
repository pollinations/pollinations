/**
 * Image Worker validation test configuration.
 *
 * Required environment variables:
 *   WORKER_PSK        — pre-shared key for Worker auth
 *   ENTER_TOKEN       — PLN_ENTER_TOKEN value
 *
 * Optional:
 *   IMAGE_WORKER_URL  — image service base URL (defaults to myceli.ai staging)
 */

export const IMAGE_URL =
    process.env.IMAGE_WORKER_URL ||
    "https://image-pollinations.elliot-b6e.workers.dev";

const PSK = process.env.WORKER_PSK;
const ENTER_TOKEN = process.env.ENTER_TOKEN;

if (!PSK || !ENTER_TOKEN) {
    throw new Error(
        "Missing required env vars: WORKER_PSK and ENTER_TOKEN must be set",
    );
}

/** Standard headers for image Worker requests. */
export function imageHeaders(extra: Record<string, string> = {}) {
    return {
        "x-proxy-psk": PSK,
        "x-enter-token": ENTER_TOKEN,
        ...extra,
    };
}
