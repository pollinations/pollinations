import type { Context } from "hono";
import { hasTrustedProxyHeaders } from "./public-origin.ts";

/**
 * Resolve the real visitor IP. When the worker is reached via the
 * pollinations-myceli-proxy in the old Cloudflare account, CF-Connecting-IP is the
 * proxy Worker's IP — useless for rate limiting or abuse detection. The proxy
 * forwards the original visitor IP as X-Original-Client-IP, which we prefer
 * when present.
 *
 * For direct hits (e.g. *.myceli.ai), only CF-Connecting-IP is present and
 * already correct.
 */
export function getRealClientIp(c: Context): string {
    if (hasTrustedProxyHeaders(c)) {
        const originalIp = c.req.header("x-original-client-ip");
        if (originalIp) return originalIp;
    }

    return c.req.header("cf-connecting-ip") || "unknown";
}
