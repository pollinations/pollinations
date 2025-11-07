import { createMiddleware } from "hono/factory";
import type { AuthEnv } from "./auth.ts";

/**
 * Pollen-based rate limiting middleware using Durable Objects for publishable key requests.
 * 
 * Provides strongly consistent, pollen-based rate limiting with:
 * - Secret API keys (sk_): Skip rate limiting entirely
 * - Publishable keys (pk_): Pollen-based rate limiting with Durable Objects
 * 
 * Rate limiting strategy:
 * - Token bucket with pollen units (not request counts)
 * - Capacity: 0.1 pollen (allows ~2 average requests burst)
 * - Refill rate: 1/60 pollen per minute = 1 pollen per hour (steady-state throughput)
 * - Identifier: pk_{apiKeyId}:ip:{ip} (prevents abuse via key + IP)
 * - Pre-request check (allow if bucket > 0)
 * - Post-request deduction (actual pollen cost from response tracking)
 */
export const frontendKeyRateLimit = createMiddleware<AuthEnv>(async (c, next) => {
    // Skip rate limiting for secret API keys
    const apiKey = c.var?.auth?.apiKey;
    if (apiKey?.metadata?.keyType === "secret") {
        return next();
    }
    
    // Only apply to publishable keys
    if (apiKey?.metadata?.keyType !== "publishable") {
        return next();
    }
    
    // Get composite identifier: pk_{apiKeyId}:ip:{ip}
    const ip = c.req.header("cf-connecting-ip") || "unknown";
    const identifier = `pk_${apiKey.id}:ip:${ip}`;
    
    // Get Durable Object for this (key + IP) combination
    const id = c.env.POLLEN_RATE_LIMITER.idFromName(identifier);
    const stub = c.env.POLLEN_RATE_LIMITER.get(id) as DurableObjectStub & {
        checkRateLimit(): Promise<{ allowed: boolean; remaining: number; waitMs: number }>;
        consumePollen(cost: number): Promise<void>;
    };
    
    // Check pollen rate limit (pre-request)
    const result = await stub.checkRateLimit();
    
    // Set rate limit headers (pollen units) - read capacity from env
    const capacity = c.env.POLLEN_BUCKET_CAPACITY ?? 0.1;
    c.header("RateLimit-Limit", capacity.toString());
    c.header("RateLimit-Remaining", result.remaining.toFixed(4)); // Current pollen
    
    if (!result.allowed) {
        // If waitMs is provided, it's a rate limit exhaustion (not concurrent request)
        if (result.waitMs !== undefined) {
            const retryAfterSeconds = parseFloat((result.waitMs / 1000).toFixed(2));
            c.header("Retry-After", Math.ceil(retryAfterSeconds).toString());
            
            return c.json({
                error: "Rate limit exceeded",
                message: `Rate limit bucket exhausted (${result.remaining.toFixed(2)}/${capacity}). Retry after ${retryAfterSeconds}s. Use secret keys (sk_*) for unlimited requests.`,
                retryAfterSeconds: retryAfterSeconds,
                rateLimitRemaining: parseFloat(result.remaining.toFixed(2))
            }, 429);
        }
        
        // Concurrent request - no wait time, just retry
        return c.json({
            error: "Concurrent request in progress",
            message: "Another request is currently being processed. Please wait until it finishes.",
            rateLimitRemaining: parseFloat(result.remaining.toFixed(2))
        }, 429);
    }
    
    // Process request
    await next();
    
    // Deduct actual pollen cost after request completes (post-request)
    // Use waitUntil() - Durable Object's single-threaded nature ensures sequential processing
    const pollenPrice = c.res.headers.get("X-Pollen-Price");
    if (pollenPrice) {
        const cost = parseFloat(pollenPrice);
        if (!isNaN(cost) && cost > 0) {
            c.executionCtx.waitUntil(stub.consumePollen(cost));
        }
    }
});
