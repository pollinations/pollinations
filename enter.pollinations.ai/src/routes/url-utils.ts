/**
 * Returns true if the URL's hostname is a loopback/local address.
 * Used to prevent localhost URLs from being registered or resolved as
 * belonging to a specific app — any local dev app shares these hostnames.
 */
export function isLoopbackUrl(url: string): boolean {
    try {
        const { hostname } = new URL(url);
        const h = normalizeHostname(hostname);
        if (h === "localhost" || h === "0.0.0.0" || h === "::1") return true;
        if (/^127\.\d+\.\d+\.\d+$/.test(h)) return true;
        return false;
    } catch {
        return false;
    }
}

/**
 * Match registered app URLs against redirect URLs using exact URL semantics.
 * URL parsing normalizes case for scheme/host, default ports, and a missing
 * root slash, while still requiring the full path and query string to match.
 */
export function appUrlMatchesRedirect(
    appUrl: string,
    redirectUrl: string,
): boolean {
    const normalizedAppUrl = normalizeUrlForExactMatch(appUrl);
    const normalizedRedirectUrl = normalizeUrlForExactMatch(redirectUrl);
    return (
        normalizedAppUrl !== null &&
        normalizedRedirectUrl !== null &&
        normalizedAppUrl === normalizedRedirectUrl
    );
}

function normalizeHostname(hostname: string): string {
    return hostname
        .toLowerCase()
        .replace(/^\[(.*)\]$/, "$1")
        .replace(/\.$/, "");
}

function normalizeUrlForExactMatch(url: string): string | null {
    try {
        return new URL(url).href;
    } catch {
        return null;
    }
}
