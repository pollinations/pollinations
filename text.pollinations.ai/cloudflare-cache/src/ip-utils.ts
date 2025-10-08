/**
 * IP utility functions for Cloudflare Workers
 */

/**
 * Get the client IP address from the request
 * @param req - The request object
 * @returns The client IP address or 'unknown'
 */
export function getClientIp(req: Request): string {
    // Handle Cloudflare Workers Request
    if (req.headers && typeof req.headers.get === "function") {
        return (
            req.headers.get("cf-connecting-ip") ||
            req.headers.get("x-real-ip") ||
            req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
            "unknown"
        );
    }

    // Handle Express/Node.js request (for compatibility)
    const anyReq = req as any;
    if (anyReq.headers && typeof anyReq.headers === "object") {
        return (
            anyReq.headers["cf-connecting-ip"] ||
            anyReq.headers["x-real-ip"] ||
            (anyReq.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
            anyReq.connection?.remoteAddress ||
            "unknown"
        );
    }

    return "unknown";
}
