/**
 * Upstream statuses that make a request move on to the next pool member.
 * Portkey gets this as `strategy.on_status_codes` for text; the buffered image
 * path applies the same list in-worker before retrying.
 *
 * 400 and 422 are left out on purpose: those are caller errors and replaying
 * them cannot succeed. 401/402/403/404 are included because they mean this
 * member's credentials or upstream model are broken, which another member may
 * survive.
 */
export const FALLBACK_ON_STATUS_CODES = [
    401, 402, 403, 404, 408, 429, 500, 502, 503, 504,
];
