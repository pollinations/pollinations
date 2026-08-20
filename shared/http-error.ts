import type { ContentfulStatusCode } from "hono/utils/http-status";
import { UpstreamError } from "./error.ts";

function safeUrl(url?: string): URL | undefined {
    if (!url) return undefined;
    try {
        return new URL(url);
    } catch {
        return undefined;
    }
}

/**
 * @deprecated Use `UpstreamError` directly instead.
 *
 * Custom HTTP error class adapted to extend `UpstreamError`.
 */
export class HttpError extends UpstreamError {
    public override readonly name = "UpstreamError" as const;
    public readonly details?: unknown;
    public readonly upstreamUrl?: string;

    constructor(
        message: string,
        status: number = 500,
        details?: unknown,
        upstreamUrl?: string,
        errorCode?: string,
    ) {
        const responseBody =
            typeof details === "object" &&
            details !== null &&
            "body" in details &&
            typeof (details as { body?: unknown }).body === "string"
                ? (details as { body: string }).body
                : typeof details === "string"
                  ? details
                  : undefined;
        super(status as ContentfulStatusCode, {
            message,
            requestUrl: safeUrl(upstreamUrl),
            upstreamStatus: status,
            responseBody,
            errorCode,
        });
        this.details = details;
        this.upstreamUrl = upstreamUrl;
    }
}
