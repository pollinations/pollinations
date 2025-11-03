import { rateLimiter } from "hono-rate-limiter";
import { createMiddleware } from "hono/factory";
import type { AuthEnv } from "./auth.ts";
import { TokenBucketKVStore } from "./rateLimit.store.ts";

/**
 * Rate limiting middleware for publishable key requests.
 * 
 * Uses token bucket algorithm for smooth, continuous rate limiting:
 * - Secret API keys (sk_): Skip rate limiting entirely
 * - Publishable keys (pk_): 3 token capacity, 1 token per 15 seconds
 * 
 * Token bucket benefits:
 * - Allows bursts up to 3 requests
 * - Tokens refill continuously (no hard 90-second lockout)
 * - Better UX - users get tokens back gradually
 * - Same protection as fixed window but smoother
 */
export const frontendKeyRateLimit = createMiddleware<AuthEnv>(async (c, next) => {
    const limiter = rateLimiter<AuthEnv>({
        windowMs: 30 * 1000, // 30 seconds (used for resetTime calculation)
        limit: 3, // Max 3 tokens (capacity)
        standardHeaders: "draft-6",
        keyGenerator: (c) => c.req.header("cf-connecting-ip") || "unknown",
        skip: (c) => {
            // Skip rate limiting for secret API keys only (keyType: "secret")
            // Publishable keys (keyType: "publishable") are rate limited
            const apiKey = c.var?.auth?.apiKey;
            return apiKey?.metadata?.keyType === "secret";
        },
        store: new TokenBucketKVStore({ 
            namespace: c.env.KV,
            prefix: "ratelimit:"
        }),
        message: () => {
            return "Rate limit exceeded for publishable key. Client-side keys (pk_*) are limited to 3 requests with 1 token refilling every 15 seconds. Use a secret key (sk_*) for server-side applications to bypass rate limits.";
        },
    });
    
    return limiter(c, next);
});
