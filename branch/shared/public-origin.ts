import type { Context } from "hono";

// Public-facing hosts that can arrive through an intermediate edge layer such
// as CloudFront. We trust X-Forwarded-Host only when it names one of them.
const TRUSTED_PUBLIC_HOSTS = new Set<string>([
    "enter.pollinations.ai",
    "staging.enter.pollinations.ai",
    "dev.enter.pollinations.ai",
    "gen.pollinations.ai",
    "staging.gen.pollinations.ai",
    "media.pollinations.ai",
]);

function getTrustedForwardedHost(c: Context): string | undefined {
    // On Cloudflare custom-domain routes the Worker is invoked on the public
    // host (e.g. gen.pollinations.ai), so c.req.url.host already equals the
    // proxy's X-Forwarded-Host — comparing the two never identifies a proxy
    // hop. Instead, trust X-Forwarded-Host when it names a known public host.
    const forwardedHost = c.req.header("x-forwarded-host");

    return forwardedHost && TRUSTED_PUBLIC_HOSTS.has(forwardedHost)
        ? forwardedHost
        : undefined;
}

export function hasTrustedProxyHeaders(c: Context): boolean {
    return Boolean(getTrustedForwardedHost(c));
}

/**
 * Resolve the *public-facing* origin of a request, honoring X-Forwarded-Host
 * and X-Forwarded-Proto when set by a trusted upstream edge layer.
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
