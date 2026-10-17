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

/**
 * gen <-> enter host pairs. Matching is bidirectional — either side of a
 * pair resolves to that pair — most-specific first. Anything unrecognised
 * (local dev, workerd previews, custom domains) falls back to production.
 */
const GEN_ENTER_HOST_PAIRS: ReadonlyArray<readonly [string, string]> = [
    ["staging.gen.pollinations.ai", "staging.enter.pollinations.ai"],
    ["dev.gen.pollinations.ai", "dev.enter.pollinations.ai"],
    ["gen.pollinations.ai", "enter.pollinations.ai"],
];

/**
 * The sibling public host (gen <-> enter) for this origin.
 *
 * Known tiers (staging, dev) stay on their own tier in both directions;
 * unrecognised origins fall back to the production counterpart with the
 * port cleared, so a localhost:8788 deployment never advertises a
 * production host on a dev port.
 */
export function siblingOrigin(origin: string, to: "gen" | "enter"): string {
    const url = new URL(origin);
    const want = to === "gen" ? 0 : 1;
    const pair = GEN_ENTER_HOST_PAIRS.find(
        ([gen, enter]) => gen === url.hostname || enter === url.hostname,
    );
    url.hostname = pair
        ? pair[want]
        : to === "gen"
            ? "gen.pollinations.ai"
            : "enter.pollinations.ai";
    url.protocol = "https:";
    url.port = "";
    return url.origin;
}
