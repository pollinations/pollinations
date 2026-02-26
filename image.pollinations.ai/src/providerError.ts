import { HttpError } from "./httpError.ts";

/**
 * Error originating from an upstream provider (e.g. api.airforce, Azure, ByteDance).
 *
 * Use this instead of `HttpError` when the failure is caused by an external
 * service rather than Pollinations itself. The `provider`, `upstreamStatus`,
 * and `upstreamBody` fields are surfaced in the JSON error response so that
 * API consumers can distinguish upstream outages from Pollinations-side errors
 * and inspect the raw provider response for debugging.
 *
 * Keep `message` user-friendly — raw upstream details belong in `upstreamBody`.
 *
 * @example
 * throw new ProviderError(
 *     "api.airforce",
 *     "Image generation failed — the upstream provider (api.airforce) returned an error (502). Please try again later.",
 *     502,
 *     502,
 *     { error: "upstream timeout" },
 * );
 */
export class ProviderError extends HttpError {
    /** Display name of the upstream provider (e.g. "api.airforce", "Azure GPT Image") */
    provider: string;
    /** HTTP status code returned by the upstream provider, if available */
    upstreamStatus?: number;
    /** Raw response body from the upstream provider, for structured debugging */
    upstreamBody?: unknown;

    constructor(
        provider: string,
        message: string,
        status: number = 500,
        upstreamStatus?: number,
        upstreamBody?: unknown,
    ) {
        super(message, status);
        this.name = "ProviderError";
        this.provider = provider;
        this.upstreamStatus = upstreamStatus;
        this.upstreamBody = upstreamBody;

        if ("captureStackTrace" in Error) {
            (
                Error as {
                    captureStackTrace: (target: object, ctor: Function) => void;
                }
            ).captureStackTrace(this, ProviderError);
        }
    }
}
