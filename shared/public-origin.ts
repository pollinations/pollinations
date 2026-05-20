import type { Context } from "hono";

/**
 * Resolve the *public-facing* origin of a request, honoring X-Forwarded-Host
 * and X-Forwarded-Proto when set by a trusted upstream proxy. Used when the
 * Worker is reached via the pollinations-proxy in the old Cloudflare account.
 *
 * Falls back to the request URL's own origin (which on direct hits is the
 * Myceli upstream hostname).
 */
export function getPublicOrigin(c: Context): string {
    const forwardedHost = c.req.header("x-forwarded-host");
    if (forwardedHost) {
        const proto = c.req.header("x-forwarded-proto") || "https";
        return `${proto}://${forwardedHost}`;
    }
    return new URL(c.req.url).origin;
}

/**
 * Build a public-facing URL using the same path/search as the incoming
 * request but with the public-facing origin.
 */
export function getPublicUrl(c: Context): URL {
    const url = new URL(c.req.url);
    const publicOrigin = getPublicOrigin(c);
    const result = new URL(url.pathname + url.search, publicOrigin);
    return result;
}
