import { rateLimiter } from "hono-rate-limiter";
import { WorkersKVStore } from "@hono-rate-limiter/cloudflare";
import { createMiddleware } from "hono/factory";
import type { AuthEnv } from "./auth.ts";

/**
 * Rate limiting middleware for publishable key requests.
 * 
 * - Secret API keys (sk_): Skip rate limiting entirely
 * - Publishable keys (pk_) / anonymous: 24 requests per 2 minutes (1 request every 5 seconds)
 */
export const frontendKeyRateLimit = createMiddleware<AuthEnv>(async (c, next) => {
    const limiter = rateLimiter<AuthEnv>({
        windowMs: 2 * 60 * 1000, // 2 minutes (120 seconds)
        limit: 24, // 24 requests per 2 minutes = 1 request every 5 seconds
        standardHeaders: "draft-6",
        keyGenerator: (c) => c.req.header("cf-connecting-ip") || "unknown",
        skip: (c) => {
            // Skip rate limiting for secret API keys only (keyType: "secret")
            // Publishable keys (keyType: "publishable") and anonymous users are rate limited
            const apiKey = c.var?.auth?.apiKey;
            return apiKey?.metadata?.keyType === "secret";
        },
        store: new WorkersKVStore({ 
            namespace: c.env.KV,
            prefix: "ratelimit:"
        }),
    });
    
    return limiter(c, next);
});
