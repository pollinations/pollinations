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
        const retryAfterSeconds = Math.ceil(result.waitMs / 1000);
        c.header("Retry-After", retryAfterSeconds.toString());
        
        const refillRate = c.env.POLLEN_REFILL_PER_HOUR ?? 1.0;
        return c.json({
            error: `Pollen rate limit exceeded for publishable key. Your pollen bucket (${capacity} capacity) is empty. Refill rate: ${refillRate} pollen per hour. Use a secret key (sk_*) for server-side applications to bypass rate limits.`,
            retryAfterSeconds,
            pollenCapacity: capacity,
            pollenRefillRate: `${refillRate} per hour`
        }, 429);
    }
    
    // Process request
    await next();
    
    // Deduct actual pollen cost after request completes (post-request)
    // Read price from internal header set by track middleware
    const pollenPrice = c.res.headers.get("X-Pollen-Price");
    if (pollenPrice) {
        const cost = parseFloat(pollenPrice);
        if (!isNaN(cost) && cost > 0) {
            c.executionCtx.waitUntil(
                stub.consumePollen(cost).catch((error) => {
                    c.var.log.error("Failed to consume pollen: {error}", { error, identifier, cost });
                })
            );
        }
        // Remove internal header from response
        c.res.headers.delete("X-Pollen-Price");
    }
});
