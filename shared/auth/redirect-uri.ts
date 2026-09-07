/**
 * Match an incoming `redirect_uri` against a registered allowlist for a `pk_`.
 *
 * Scheme policy (https-only except loopback http) is enforced at registration
 * time (see validateRedirectUriFormat). Matching trusts the stored allowlist
 * and does not re-check the scheme.
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

/**
 * Strict variant for the OAuth authorization-code flow (RFC 6749 §3.1.2.3):
 * the authorization code rides the redirect query string, so the fragment-era
 * leniency of accepting extra query params must not apply. The query must
 * equal the registered entry's exactly (normally: both absent). Loopback
 * ports stay port-agnostic (RFC 8252 §7.3) and one trailing slash is still
 * ignored. The legacy fragment flow keeps the lenient matcher above.
 */
export function redirectUriMatchesAllowlistExact(
    uri: string,
    allowlist: readonly string[] | null | undefined,
): boolean {
    if (!allowlist?.length) return false;
    const incoming = safeParse(uri);
    if (!incoming) return false;
    return allowlist.some((entry) => matchesEntry(incoming, entry, true));
}

export function isAllowedRedirectUrl(url: URL): boolean {
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && isLoopbackHostname(url.hostname);
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

function matchesEntry(
    incoming: URL,
    entryUrl: string,
    exactQuery = false,
): boolean {
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
    if (exactQuery) {
        if (incoming.search !== entry.search) return false;
    } else if (entry.search && incoming.search !== entry.search) {
        return false;
    }
    if (isLoopbackHostname(entry.hostname)) return true;
    return incoming.port === entry.port;
}
