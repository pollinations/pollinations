/** Resolve a dashboard path and validate the origin after URL normalization. */
export function getStripeReturnUrl(baseUrl: string, path?: string): URL {
    const fallback = new URL("/pollen", baseUrl);
    if (!path || !/^\/(?![/\\])/.test(path) || path.includes("\\")) {
        return fallback;
    }
    try {
        const url = new URL(path, baseUrl);
        if (url.origin !== fallback.origin) return fallback;
        // Stripe status parameters belong in the query, never a fragment.
        url.hash = "";
        return url;
    } catch {
        return fallback;
    }
}
