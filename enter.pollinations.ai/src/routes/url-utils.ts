/**
 * Returns true if the URL's hostname is a loopback/local address.
 * Used to prevent localhost URLs from being registered or resolved as
 * belonging to a specific app — any local dev app shares these hostnames.
 */
export function isLoopbackUrl(url: string): boolean {
    try {
        const { hostname } = new URL(url);
        const h = hostname.toLowerCase();
        if (h === "localhost" || h === "0.0.0.0" || h === "::1") return true;
        if (/^127\.\d+\.\d+\.\d+$/.test(h)) return true;
        return false;
    } catch {
        return false;
    }
}
