import type { ContentfulStatusCode } from "hono/utils/http-status";
import { UpstreamError } from "./error.ts";

/**
 * @deprecated Use {@link UpstreamError} directly in new code.
 *
 * Unified HTTP error class for upstream/backend failures.
 *
 * Extends {@link UpstreamError} so every HttpError is also an UpstreamError,
 * giving it the full upstream context (requestUrl, upstreamStatus, responseBody,
 * upstreamHeaders, errorCode) that the error handler serialises into the
 * response envelope.
 *
 * **Migration rule (2026-08-26):**
 * - New code **must** throw `UpstreamError` directly.
 * - Existing `HttpError` sites may keep using this class for backward
 *   compatibility; it is a thin wrapper that maps positional args to the
 *   `UpstreamError` options bag.
 * - Do **not** add new fields to `HttpError`; use `UpstreamError` options instead.
 *
 * `upstreamUrl` is the URL of the upstream backend that produced the error
 * (e.g. a provider enqueue endpoint), threaded through to `requestUrl` in the
 * error envelope so `upstreamHost` reflects the actual backend rather than the
 * gen.pollinations.ai request URL.
 *
 * `errorCode` is an optional stable, machine-readable code that the error
 * funnels propagate into the response envelope so callers can branch on a code
 * instead of matching message prose.
 */
export class HttpError extends UpstreamError {
    /** Extra structured payload carried by some image-provider callers. */
    public readonly details?: any;

    public readonly upstreamUrl?: string;

    constructor(
        message: string,
        status: number = 500,
        details?: any,
        upstreamUrl?: string,
        errorCode?: string,
    ) {
        super(status as ContentfulStatusCode, {
            message,
            requestUrl: upstreamUrl ? safeUrl(upstreamUrl) : undefined,
            upstreamStatus: status,
            errorCode,
        });
        // Override readonly name from UpstreamError; keep it writable so
        // subclasses (e.g. UserImageError) can reassign this.name.
        Object.defineProperty(this, "name", {
            value: "HttpError",
            writable: true,
            configurable: true,
            enumerable: false,
        });
        this.details = details;
        this.upstreamUrl = upstreamUrl;

        // Maintains proper stack trace for where our error was thrown (only available on V8)
        Error.captureStackTrace(this, HttpError);
    }
}

/** Parse a string into a URL, returning undefined if invalid. */
function safeUrl(raw: string): URL | undefined {
    try {
        return new URL(raw);
    } catch {
        return undefined;
    }
}
