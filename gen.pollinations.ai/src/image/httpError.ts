/**
 * Custom HTTP error class with status code.
 *
 * Adds a status code and optional details/upstream URL to Error for passing
 * HTTP status codes through the error chain. `upstreamUrl` is the URL of the
 * upstream backend that produced the error (e.g. an LTX-2 enqueue endpoint),
 * threaded through to UpstreamError.requestUrl in the error envelope so
 * `upstreamHost` reflects the actual backend rather than the gen.pollinations.ai
 * request URL. Callers must not pass URLs that include credentials in query
 * strings; this codebase auths via headers, not query strings.
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
        this.upstreamUrl = upstreamUrl;

        // Maintains proper stack trace for where our error was thrown (only available on V8)
        Error.captureStackTrace(this, HttpError);
    }
}
