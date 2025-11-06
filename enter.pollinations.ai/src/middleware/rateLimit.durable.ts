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
 * - Post-request deduction (actual pollen cost)
 * 
 * Benefits over request-count approach:
 * - Expensive requests consume more pollen
 * - No cost estimation needed
 * - Strongly consistent (no race conditions)
 * - Per (key + IP) isolation
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
    };
    
    // Check pollen rate limit
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
    
    return next();
});
