/**
 * Shared header utilities for API gateway proxying
 * Used by enter.pollinations.ai and gen.pollinations.ai
 */

export type User = {
    id: string;
    githubId: number;
    tier: string;
};

/**
 * Creates generation headers to send to backend services
 * Includes user identification and tier information
 */
export function generationHeaders(
    user?: User,
    enterToken?: string
): Record<string, string> {
    const headers: Record<string, string> = {};
    
    if (enterToken) {
        headers["x-enter-token"] = enterToken;
    }
    
    if (user) {
        headers["x-github-id"] = String(user.githubId);
        headers["x-user-tier"] = user.tier;
    }
    
    return headers;
}

/**
 * Creates proxy headers for forwarding client information
 * Includes IP, host, and request ID
 */
export function proxyHeaders(
    requestHeaders: Record<string, string>,
    requestId: string,
    cfConnectingIp?: string,
    host?: string
): Record<string, string> {
    const clientIP = cfConnectingIp || "";
    const clientHost = host || "";
    
    return {
        ...requestHeaders,
        "x-request-id": requestId,
        "x-forwarded-host": clientHost,
        "x-forwarded-for": clientIP,
        "x-real-ip": clientIP,
    };
}

/**
 * Extracts Bearer token from Authorization header (RFC 6750)
 */
export function extractApiKey(headers: Headers): string | null {
    const auth = headers.get("authorization");
    const match = auth?.match(/^Bearer (.+)$/);
    return match?.[1] || null;
}
