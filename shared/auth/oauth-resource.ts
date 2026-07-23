/**
 * Normalize an OAuth Resource Indicator (RFC 8707).
 *
 * Pollinations resource servers are HTTPS services. Root resources use their
 * origin without a trailing slash so clients that send either common form
 * interoperate consistently.
 */
export function normalizeOAuthResource(value: unknown): string | null {
    if (typeof value !== "string") return null;

    try {
        const url = new URL(value);
        if (
            url.protocol !== "https:" ||
            url.username ||
            url.password ||
            url.hash
        ) {
            return null;
        }

        return url.pathname === "/" && !url.search
            ? url.origin
            : url.toString();
    } catch {
        return null;
    }
}
