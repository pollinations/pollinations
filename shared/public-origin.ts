import type { Context } from "hono";

export const PROXY_SECRET_HEADER = "x-pollinations-proxy-secret";

const TRUSTED_FORWARDED_HOSTS: Record<string, string> = {
    "enter.myceli.ai": "enter.pollinations.ai",
    "staging.enter.myceli.ai": "staging.enter.pollinations.ai",
    "dev.enter.myceli.ai": "dev.enter.pollinations.ai",
    "gen.myceli.ai": "gen.pollinations.ai",
    "staging.gen.myceli.ai": "staging.gen.pollinations.ai",
    "media.myceli.ai": "media.pollinations.ai",
};

function hasValidProxySecret(c: Context): boolean {
    const expected = (c.env as { POLLINATIONS_PROXY_SECRET?: string } | undefined)
        ?.POLLINATIONS_PROXY_SECRET;
    if (!expected) return false;
    return c.req.header(PROXY_SECRET_HEADER) === expected;
}

function getTrustedForwardedHost(c: Context): string | undefined {
    if (!hasValidProxySecret(c)) return undefined;

    const requestHost = new URL(c.req.url).host;
    const forwardedHost = c.req.header("x-forwarded-host");

    return TRUSTED_FORWARDED_HOSTS[requestHost] === forwardedHost
        ? forwardedHost
        : undefined;
}

export function hasTrustedProxyHeaders(c: Context): boolean {
    return Boolean(getTrustedForwardedHost(c));
}

/**
 * Resolve the *public-facing* origin of a request, honoring X-Forwarded-Host
 * and X-Forwarded-Proto when set by a trusted upstream proxy. Used when the
 * Worker is reached via the pollinations-myceli-proxy in the old Cloudflare account.
 *
 * Falls back to the request URL's own origin (which on direct hits is the
 * Myceli upstream hostname).
 */
export function getPublicOrigin(c: Context): string {
    const forwardedHost = getTrustedForwardedHost(c);
    if (forwardedHost) {
        const proto =
            c.req.header("x-forwarded-proto") === "http" ? "http" : "https";
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
