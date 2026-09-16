import { ensureUpstreamOk, UpstreamError } from "@shared/error.ts";

type FetchUpstreamOptions = RequestInit & {
    /**
     * Prefix for transport failure messages (HTTP errors keep the provider message).
     * Defaults to "Upstream request failed".
     */
    errorLabel?: string;
};

type UpstreamFetcher = (
    input: RequestInfo | URL,
    init?: RequestInit,
) => Promise<Response>;

/**
 * Adds transport diagnostics and shares HTTP error handling with the other
 * generation clients. Provider response bodies are preserved in full.
 *
 * Returns the Response on success. Caller is responsible for `await response.json()`
 * or similar — keeping body parsing in the caller preserves typing.
 */
export async function fetchUpstream(
    url: string,
    options: FetchUpstreamOptions = {},
    fetcher: UpstreamFetcher = fetch,
): Promise<Response> {
    const { errorLabel = "Upstream request failed", ...init } = options;
    let response: Response;
    try {
        response = await fetcher(url, init);
    } catch (error) {
        // fetch() rejections (e.g. "Network connection lost") carry no
        // upstream context; rethrow with the URL so error tracking records
        // the host instead of a bare TypeError.
        const message = error instanceof Error ? error.message : String(error);
        throw UpstreamError.fromProvider(502, {
            message: `${errorLabel}: ${message}`,
            requestUrl: URL.parse(url) ?? undefined,
            cause: error,
        });
    }

    return ensureUpstreamOk(response, url);
}
