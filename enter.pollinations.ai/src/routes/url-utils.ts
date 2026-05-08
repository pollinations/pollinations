/**
 * Returns true if the URL's hostname is a loopback/local address.
 * Kept for the consent UI to recognize localhost dev servers and word the
 * "unrecognized app" warning appropriately. Not used for identity inference.
 */
export function isLoopbackUrl(url: string): boolean {
    const parsed = safeParse(url);
    return parsed ? isLoopbackHostname(parsed.hostname) : false;
}

function isLoopbackHostname(hostname: string): boolean {
    const h = normalizeHostname(hostname);
    if (h === "localhost" || h === "0.0.0.0" || h === "::1") return true;
    if (/^127\.\d+\.\d+\.\d+$/.test(h)) return true;
    return false;
}

function normalizeHostname(hostname: string): string {
    return hostname
        .toLowerCase()
        .replace(/^\[(.*)\]$/, "$1")
        .replace(/\.$/, "");
}

function safeParse(url: string): URL | null {
    try {
        return new URL(url);
    } catch {
        return null;
    }
}

/**
 * Match an incoming `redirect_uri` against a registered allowlist for a `pk_`.
 *
 * Comparison rules:
 * - Scheme + hostname + path are matched exactly (after lowercasing host).
 * - Query strings are ignored: apps round-trip state (e.g. `?prompt=...`) and
 *   the auth code/token rides the URL fragment, not the query. Pinning host
 *   and path is what blocks confused-deputy attacks; matching the query adds
 *   no security and breaks legitimate apps. Mirrors GitHub's behavior.
 * - For loopback entries (RFC 8252 §7.3): port is ignored — any port matches.
 *   This covers native/CLI apps that bind to ephemeral ports each run.
 * - For non-loopback entries: port must match (default ports normalized).
 * - Fragments are rejected; redirect URIs must not contain them.
 *
 * Returns false on any parse error or empty allowlist.
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
    if (incoming.pathname !== entry.pathname) return false;
    if (isLoopbackHostname(entry.hostname)) return true;
    return incoming.port === entry.port;
}
