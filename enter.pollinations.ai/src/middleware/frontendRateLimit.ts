import { rateLimiter } from "hono-rate-limiter";
import { WorkersKVStore } from "@hono-rate-limiter/cloudflare";
import { createMiddleware } from "hono/factory";
import type { AuthEnv } from "./auth.ts";

/**
 * Rate limiting middleware for frontend requests.
 * 
 * - Server API keys (sk_): Unlimited
 * - Frontend keys (pk_) / anonymous: 1 request per 10 seconds
 */
export const frontendKeyRateLimit = createMiddleware<AuthEnv>(async (c, next) => {
    const limiter = rateLimiter<AuthEnv>({
        windowMs: 10 * 1000, // 10 seconds
        limit: (c) => {
            // Unlimited for server API keys (sk_ prefix)
            if (c.var.auth?.apiKey) {
                return 0; // 0 = unlimited
            }
            return 1; // 1 request per 10 seconds for frontend/anonymous
        },
        standardHeaders: "draft-6",
        keyGenerator: (c) => c.req.header("cf-connecting-ip") || "unknown",
        store: new WorkersKVStore({ 
            namespace: c.env.KV,
            prefix: "ratelimit:"
        }),
    });
    
    return limiter(c, next);
});
