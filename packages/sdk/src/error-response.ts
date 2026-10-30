import { PollinationsError } from "./types.js";

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
        return seconds;
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
 * True when Pollinations failed rather than the request: a 5xx response, or no
 * response at all (status 0). 401 and 403 are not outages.
 */
export function isOutageError(error: unknown): boolean {
    // By shape, not instanceof: the root and React entry points are separate
    // bundles, each with its own PollinationsError class.
    if (!(error instanceof Error) || error.name !== "PollinationsError") {
        return false;
    }
    const { status } = error as PollinationsError;
    return status === 0 || status >= 500;
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
            : typeof record.error === "string"
              ? record.error
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
    // Prefer the request ID from the error body; fall back to the response's
    // X-Request-Id header so users can always include it in support reports.
    const requestId =
        typeof nested.requestId === "string"
            ? nested.requestId
            : (response.headers.get("X-Request-Id") ?? undefined);
    const retryAfter = parseRetryAfter(response);

    return new PollinationsError(
        message,
        code,
        response.status,
        details,
        requestId,
        retryAfter,
    );
}
