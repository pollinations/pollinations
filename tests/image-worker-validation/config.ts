/**
 * Image Worker validation test configuration.
 *
 * Required environment variables:
 *   ENTER_TOKEN       — PLN_ENTER_TOKEN value
 *
 * Optional:
 *   IMAGE_WORKER_URL  — image service base URL (defaults to myceli.ai staging)
 */

export const IMAGE_URL =
    process.env.IMAGE_WORKER_URL ||
    "https://image-pollinations.elliot-b6e.workers.dev";

const ENTER_TOKEN = process.env.ENTER_TOKEN;

if (!ENTER_TOKEN) {
    throw new Error(
        "Missing required env var: ENTER_TOKEN must be set",
    );
}

/** Standard headers for image Worker requests. */
export function imageHeaders(extra: Record<string, string> = {}) {
    return {
        "x-enter-token": ENTER_TOKEN,
        ...extra,
    };
}
