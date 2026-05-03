/**
 * Custom HTTP error class with status code
 * Simple error class that adds a status property to Error
 * for passing HTTP status codes through the error chain
 */
export class HttpError extends Error {
    status: number;
    details?: any;
    upstreamUrl?: string;

    constructor(
        message: string,
        status: number = 500,
        details?: any,
        upstreamUrl?: string,
    ) {
        super(message);
        this.name = "HttpError";
        this.status = status;
        this.details = details;
        // Strip query strings from upstream URLs — they often carry job IDs or
        // auth tokens, and the error envelope only surfaces hostname anyway.
        this.upstreamUrl = stripQuery(upstreamUrl);

        // Maintains proper stack trace for where our error was thrown (only available on V8)
        Error.captureStackTrace(this, HttpError);
    }
}

function stripQuery(url: string | undefined): string | undefined {
    if (!url) return undefined;
    try {
        const parsed = new URL(url);
        return `${parsed.origin}${parsed.pathname}`;
    } catch {
        return undefined;
    }
}
