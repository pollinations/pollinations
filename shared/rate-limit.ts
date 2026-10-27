import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { extractApiKey } from "./auth/api-key.ts";
import { bytesToHex, getRealClientIp } from "./client-ip.ts";

type RateLimitEnv = {
    Bindings: {
        EDGE_RATE_LIMITER?: RateLimit;
        EDGE_IP_RATE_LIMITER?: RateLimit;
    };
};

/**
 * Cloudflare-native limit (wrangler sets 600 requests per 10 seconds) that
 * runs before auth, so one flooding key is rejected without reaching D1.
 * Counts per API key, hashed so no lookup is needed. With `byIp`, requests
 * without a key count per client IP instead, and keyed requests also count
 * per IP in `EDGE_IP_RATE_LIMITER` (10,000 per 10 seconds), so rotating
 * made-up keys from one IP cannot dodge the limit. Enter leaves `byIp` off
 * because gen's internal calls arrive without a client IP. Cloudflare counts
 * per location, so this caps floods rather than enforcing an exact quota.
 */
export function rateLimit({ byIp }: { byIp: boolean }) {
    return createMiddleware<RateLimitEnv>(async (c, next) => {
        const apiKey = extractApiKey(c.req.raw);
        const ip = `ip:${getRealClientIp(c)}`;
        if (apiKey) {
            const digest = await crypto.subtle.digest(
                "SHA-256",
                new TextEncoder().encode(apiKey),
            );
            await limit(
                c,
                c.env.EDGE_RATE_LIMITER,
                `key:${bytesToHex(digest)}`,
            );
            if (byIp) await limit(c, c.env.EDGE_IP_RATE_LIMITER, ip);
        } else if (byIp) {
            await limit(c, c.env.EDGE_RATE_LIMITER, ip);
        }
        await next();
    });
}

async function limit(c: Context, limiter: RateLimit | undefined, key: string) {
    if (limiter && !(await limiter.limit({ key })).success) {
        c.header("Retry-After", "10");
        throw new HTTPException(429, {
            message: "Too many requests. Please slow down.",
        });
    }
}
