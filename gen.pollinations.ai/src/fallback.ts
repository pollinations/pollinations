/**
 * Upstream statuses that make a request move on to the model's fallback target.
 * Portkey gets this as `strategy.on_status_codes` for text; the buffered image
 * path applies the same list in-worker before retrying.
 *
 * 400 and 422 are left out on purpose: those are caller errors and replaying
 * them cannot succeed. 401/402/403/404 are included because they mean the
 * primary's credentials or upstream model are broken, which the fallback may
 * survive.
 */
export const FALLBACK_ON_STATUS_CODES = [
    401, 402, 403, 404, 408, 429, 500, 502, 503, 504,
];

/**
 * Network-level failures — unreachable host, expired cert, refused connection —
 * arrive as a TypeError with no status, and are the most likely hard failure for
 * a self-hosted endpoint. They must fail over, but the match is on the message
 * so that our own TypeErrors (a null dereference in a handler) are not mistaken
 * for one and silently blamed on the upstream.
 */
export function isNetworkFailure(error: unknown): boolean {
    return (
        error instanceof TypeError &&
        /fetch failed|network|connection|socket/i.test(error.message)
    );
}
