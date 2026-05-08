/**
 * Match an incoming `redirect_uri` against a registered OAuth client allowlist.
 *
 * Comparison rules:
 * - Scheme + hostname + path are matched exactly (after lowercasing host).
 * - Trailing slash on the path is insignificant: `/cb` and `/cb/` match.
 * - Query strings are ignored when the registered URI has no query: apps
 *   round-trip state (e.g. `?prompt=...`) and the auth code/token rides the URL
 *   fragment, not the query. If the registered URI includes a query, it must
 *   match exactly so existing query-bound allowlist entries are not broadened.
 * - For loopback entries (RFC 8252 §7.3): port is ignored — any port matches.
 *   This covers native/CLI apps that bind to ephemeral ports each run.
 * - For non-loopback entries: port must match (default ports normalized).
 * - Fragments are rejected; redirect URIs must not contain them.
 *
 * Returns false on any parse error or empty allowlist.
 *
 * Single source of truth for both /api/app-lookup (consent screen attribution)
 * and createApiKeyForUser (sk_ minting). Keep them aligned.
 */
export function redirectUriMatchesAllowlist(
    uri: string,
    allowlist: readonly string[] | null | undefined,
): boolean {
    if (!allowlist?.length) return false;
    const incoming = safeParse(uri);
    if (!incoming) return false;
    return allowlist.some((entry) => matchesEntry(incoming, entry));
}

export function isLoopbackHostname(hostname: string): boolean {
    const h = normalizeHostname(hostname);
    if (h === "localhost" || h === "0.0.0.0" || h === "::1") return true;
    if (/^127\.\d+\.\d+\.\d+$/.test(h)) return true;
    return false;
}

function safeParse(url: string): URL | null {
    try {
        return new URL(url);
    } catch {
        return null;
    }
}

function normalizeHostname(hostname: string): string {
    return hostname
        .toLowerCase()
        .replace(/^\[(.*)\]$/, "$1")
        .replace(/\.$/, "");
}

function normalizePathname(pathname: string): string {
    return pathname.length > 1 && pathname.endsWith("/")
        ? pathname.slice(0, -1)
        : pathname;
}

function matchesEntry(incoming: URL, entryUrl: string): boolean {
    const entry = safeParse(entryUrl);
    if (!entry) return false;
    if (incoming.hash || entry.hash) return false;
    if (incoming.protocol !== entry.protocol) return false;
    if (
        normalizeHostname(incoming.hostname) !==
        normalizeHostname(entry.hostname)
    ) {
        return false;
    }
    if (
        normalizePathname(incoming.pathname) !==
        normalizePathname(entry.pathname)
    ) {
        return false;
    }
    if (entry.search && incoming.search !== entry.search) return false;
    if (isLoopbackHostname(entry.hostname)) return true;
    return incoming.port === entry.port;
}
