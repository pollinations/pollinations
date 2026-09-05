import type { ContentfulStatusCode } from "hono/utils/http-status";
import { UpstreamError } from "./error.ts";

function safeUrl(value?: string): URL | undefined {
    if (!value) return undefined;
    try {
        return new URL(value);
    } catch {
        return undefined;
    }
}

/**
 * @deprecated Use UpstreamError for new code.
 *
 * Preserves the legacy image/3D constructor and fields while making existing
 * errors visible to the shared UpstreamError handler.
 */
export class HttpError extends UpstreamError {
    public override name = "HttpError";
    // biome-ignore lint/suspicious/noExplicitAny: legacy callers attach provider-specific response shapes
    details?: any;
    upstreamUrl?: string;

    constructor(
        message: string,
        status: number = 500,
        // biome-ignore lint/suspicious/noExplicitAny: preserve the legacy constructor while callers migrate
        details?: any,
        upstreamUrl?: string,
        errorCode?: string,
    ) {
        const responseBody =
            typeof details?.body === "string" ? details.body : undefined;
        super(status as ContentfulStatusCode, {
            message,
            requestUrl: safeUrl(upstreamUrl),
            upstreamStatus: status,
            responseBody,
            errorCode,
        });
        this.details = details;
        this.upstreamUrl = upstreamUrl;

        // Maintains proper stack trace for where our error was thrown (only available on V8)
        Error.captureStackTrace(this, HttpError);
    }
}
