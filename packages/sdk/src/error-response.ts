import { PollinationsError } from "./types.js";

// Default Retry-After delay for rate-limit errors when the header is missing
// or malformed (seconds)
const DEFAULT_RETRY_AFTER = 60;
// Cap honored Retry-After so a malicious or misconfigured upstream
// cannot force the client into an indefinite sleep.
const MAX_RETRY_AFTER_SECONDS = 300;

// Parse Retry-After header (can be seconds or HTTP date)
function parseRetryAfter(response: Response): number | undefined {
    const retryAfter = response.headers.get("Retry-After");
    if (!retryAfter) return undefined;

    // Try parsing as number of seconds.
    // Use Number() (not parseInt) so malformed values like "5abc" or "5e2x"
    // are rejected instead of being silently truncated into an aggressive
    // retry delay.
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
        return Math.min(seconds, MAX_RETRY_AFTER_SECONDS);
    }

    // Try parsing as HTTP date
    const date = Date.parse(retryAfter);
    if (!Number.isNaN(date)) {
        const delayMs = date - Date.now();
        return delayMs > 0 ? Math.ceil(delayMs / 1000) : undefined;
    }

    return undefined;
}

/**
 * Convert a failed HTTP response into a PollinationsError.
 *
 * Understands both the nested `{error: {...}}` envelope the API serves and
 * flat error bodies. Single parser shared by the client and the react hooks.
 */
export async function pollinationsErrorFromResponse(
    response: Response,
): Promise<PollinationsError> {
    let payload: unknown;
    try {
        payload = await response.json();
    } catch {
        payload = null;
    }

    const record =
        payload && typeof payload === "object"
            ? (payload as Record<string, unknown>)
            : {};
    const nested =
        record.error && typeof record.error === "object"
            ? (record.error as Record<string, unknown>)
            : record;

    const message =
        typeof nested.message === "string"
            ? nested.message
            : `Request failed with status ${response.status}`;
    const code =
        typeof nested.code === "string"
            ? nested.code
            : response.status === 401
              ? "UNAUTHORIZED"
              : "UNKNOWN_ERROR";
    const details =
        nested.details && typeof nested.details === "object"
            ? (nested.details as Record<string, unknown>)
            : undefined;
    const requestId =
        typeof nested.requestId === "string" ? nested.requestId : undefined;
    const retryAfter =
        response.status === 429
            ? (parseRetryAfter(response) ?? DEFAULT_RETRY_AFTER)
            : parseRetryAfter(response);

    return new PollinationsError(
        message,
        code,
        response.status,
        details,
        requestId,
        retryAfter,
    );
}
