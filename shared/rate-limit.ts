import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { extractApiKey } from "./auth/api-key.ts";
import { bytesToHex, getRealClientIp } from "./client-ip.ts";

type RateLimitEnv = {
    Bindings: { EDGE_RATE_LIMITER?: RateLimit };
};

/**
 * Cloudflare-native limit (wrangler sets 600 requests per 10 seconds) that
 * runs before auth, so one flooding key is rejected without reaching D1.
 * Counts per API key, hashed so no lookup is needed, and per client IP for
 * requests without a key when `byIp` is set. Enter leaves `byIp` off because
 * gen's internal calls arrive without a client IP. Cloudflare counts per
 * location, so this caps floods rather than enforcing an exact quota.
 */
export function rateLimit({ byIp }: { byIp: boolean }) {
    return createMiddleware<RateLimitEnv>(async (c, next) => {
        const limiter = c.env.EDGE_RATE_LIMITER;
        const key = limiter && (await rateLimitKey(c, byIp));
        if (key && !(await limiter.limit({ key })).success) {
            c.header("Retry-After", "10");
            throw new HTTPException(429, {
                message: "Too many requests. Please slow down.",
            });
        }
        await next();
    });
}

async function rateLimitKey(c: Context, byIp: boolean): Promise<string | null> {
    const apiKey = extractApiKey(c.req.raw);
    if (apiKey) {
        const digest = await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(apiKey),
        );
        return `key:${bytesToHex(digest)}`;
    }
    return byIp ? `ip:${getRealClientIp(c)}` : null;
}
