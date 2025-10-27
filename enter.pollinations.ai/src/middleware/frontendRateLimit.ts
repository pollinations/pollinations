import { rateLimiter } from "hono-rate-limiter";
import { WorkersKVStore } from "@hono-rate-limiter/cloudflare";
import { createMiddleware } from "hono/factory";
import type { AuthEnv } from "./auth.ts";

/**
 * Rate limiting middleware for frontend requests.
 * 
 * - Server API keys (sk_): Skip rate limiting entirely
 * - Frontend keys (pk_) / anonymous: 5 requests per 5 minutes
 */
export const frontendKeyRateLimit = createMiddleware<AuthEnv>(async (c, next) => {
    try {
        const limiter = rateLimiter<AuthEnv>({
            windowMs: 5 * 60 * 1000, // 5 minutes (300 seconds) - longer window to avoid KV expiration issues
            limit: 5, // 5 requests per 5 minutes for frontend/anonymous
            standardHeaders: "draft-6",
            keyGenerator: (c) => c.req.header("cf-connecting-ip") || "unknown",
            skip: (c) => {
                // Skip rate limiting for server API keys only (keyType: "server")
                // Frontend keys (keyType: "frontend") and anonymous users are rate limited
                const apiKey = c.var?.auth?.apiKey;
                return apiKey?.metadata?.keyType === "server";
            },
            store: new WorkersKVStore({ 
                namespace: c.env.KV,
                prefix: "ratelimit:"
            }),
        });
        
        return limiter(c, next);
    } catch (error) {
        console.error("[RateLimit] Error:", error);
        // If rate limiting fails, allow the request through
        return next();
    }
});
