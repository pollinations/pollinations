import { HttpError } from "./httpError.ts";

/**
 * Error originating from an upstream provider (e.g. api.airforce, Azure, ByteDance).
 *
 * Use this instead of `HttpError` when the failure is caused by an external
 * service rather than Pollinations itself. The `provider` and `upstreamStatus`
 * fields are surfaced in the JSON error response so that API consumers can
 * distinguish upstream outages from Pollinations-side errors.
 *
 * Raw upstream details (response bodies, internal endpoints) should be logged
 * via `debug` and NOT included in `message` — keep `message` user-friendly.
 *
 * @example
 * throw new ProviderError(
 *     "api.airforce",
 *     "Image generation failed — the upstream provider (api.airforce) returned an error (502). Please try again later.",
 *     502,
 * );
 */
export class ProviderError extends HttpError {
    /** Display name of the upstream provider (e.g. "api.airforce", "Azure GPT Image") */
    provider: string;
    /** HTTP status code returned by the upstream provider, if available */
    upstreamStatus?: number;

    constructor(
        provider: string,
        message: string,
        status: number = 500,
        upstreamStatus?: number,
    ) {
        super(message, status);
        this.name = "ProviderError";
        this.provider = provider;
        this.upstreamStatus = upstreamStatus;

        if ("captureStackTrace" in Error) {
            (
                Error as {
                    captureStackTrace: (target: object, ctor: Function) => void;
                }
            ).captureStackTrace(this, ProviderError);
        }
    }
}
