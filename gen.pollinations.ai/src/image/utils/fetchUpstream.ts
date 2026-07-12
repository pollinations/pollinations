import { HttpError } from "../httpError.ts";

type FetchUpstreamOptions = RequestInit & {
    /**
     * Prefix for the error message thrown on non-ok responses.
     * Defaults to "Upstream request failed".
     */
    errorLabel?: string;
};

/**
 * fetch() wrapper that throws HttpError(status, ..., upstreamUrl) on non-ok
 * responses. Use for upstream backend calls where the URL should appear in
 * error reports (handler.ts threads it through to UpstreamError.requestUrl).
 *
 * Returns the Response on success. Caller is responsible for `await response.json()`
 * or similar — keeping body parsing in the caller preserves typing.
 */
export async function fetchUpstream(
    url: string,
    options: FetchUpstreamOptions = {},
): Promise<Response> {
    const { errorLabel = "Upstream request failed", ...init } = options;
    const response = await fetch(url, init);

    if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new HttpError(
            body ? `${errorLabel}: ${body}` : errorLabel,
            response.status,
            undefined,
            url,
        );
    }

    return response;
}
