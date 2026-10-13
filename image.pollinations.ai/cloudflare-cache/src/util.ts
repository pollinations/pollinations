import type { Context } from "hono";

type Defined<T> = {
    [P in keyof T as T[P] extends undefined ? never : P]: NonNullable<T[P]>;
};

export function removeUndefined<T extends object>(obj: T): Defined<T> {
    const newObj = Object.fromEntries(
        Object.entries(obj).filter(
            ([_, value]) => value !== undefined && value !== null,
        ),
    );
    return newObj as Defined<T>;
}

/**
 * Headers for the origin request: the caller's headers plus the client IP
 * Cloudflare saw. cloudfront-viewer-address is dropped (undefined removes it in
 * hono/proxy): no CloudFront fronts this host, and the origin's per-IP limit
 * trusts it first, so a client-sent value would let callers pick their own IP.
 */
export function originHeaders(
    headers: Record<string, string>,
    clientIP: string,
): Record<string, string | undefined> {
    return {
        ...headers,
        "cloudfront-viewer-address": undefined,
        "x-forwarded-for": clientIP,
        "x-forwarded-host": headers.host,
        "x-real-ip": clientIP,
        "cf-connecting-ip": clientIP,
    };
}

/**
 * Helper function to set HTTP metadata headers from R2 object
 * @param {Context} c - Hono context object
 * @param {Object} httpMetadata - R2 object httpMetadata
 */
export function setHttpMetadataHeaders(
    c: Context,
    httpMetadata?: R2HTTPMetadata,
) {
    if (httpMetadata) {
        // Iterate over all httpMetadata and set headers
        for (const [key, value] of Object.entries(httpMetadata)) {
            if (!value) continue;
            // Convert camelCase to kebab-case for HTTP headers
            const headerName = key.replace(/([A-Z])/g, "-$1").toLowerCase();
            c.header(headerName, value);
        }
    } else {
        // Fallback to default content type
        c.header("Content-Type", "image/jpeg");
    }
}
