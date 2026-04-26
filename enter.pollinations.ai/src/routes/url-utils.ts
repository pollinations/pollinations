/**
 * Returns true if the URL's hostname is a loopback/local address.
 * Kept for the consent UI to recognize localhost dev servers and word the
 * "unrecognized app" warning appropriately. Not used for identity inference.
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

function normalizeHostname(hostname: string): string {
    return hostname
        .toLowerCase()
        .replace(/^\[(.*)\]$/, "$1")
        .replace(/\.$/, "");
}
