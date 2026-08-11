/**
 * Custom HTTP error class with status code.
 *
 * Adds a status code and optional details/upstream URL to Error for passing
 * HTTP status codes through the error chain. `upstreamUrl` is the URL of the
 * upstream backend that produced the error (e.g. a provider enqueue endpoint),
 * threaded through to UpstreamError.requestUrl in the error envelope so
 * `upstreamHost` reflects the actual backend rather than the gen.pollinations.ai
 * request URL. Callers must not pass URLs that include credentials in query
 * strings; this codebase auths via headers, not query strings.
 *
 * `errorCode` is an optional stable, machine-readable code (mirrors
 * `UpstreamError.errorCode`) that the error funnels propagate into the response
 * envelope so callers can branch on a code instead of matching message prose.
 */
export class HttpError extends Error {
    status: number;
    details?: any;
    upstreamUrl?: string;
    errorCode?: string;

    constructor(
        message: string,
        status: number = 500,
        details?: any,
        upstreamUrl?: string,
        errorCode?: string,
    ) {
        super(message);
        this.name = "HttpError";
        this.status = status;
        this.details = details;
        this.upstreamUrl = upstreamUrl;
        this.errorCode = errorCode;

        // Maintains proper stack trace for where our error was thrown (only available on V8)
        Error.captureStackTrace(this, HttpError);
    }
}
