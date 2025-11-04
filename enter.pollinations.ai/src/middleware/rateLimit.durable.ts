import { createMiddleware } from "hono/factory";
import type { AuthEnv } from "./auth.ts";

/**
 * Rate limiting middleware using Durable Objects for publishable key requests.
 * 
 * Provides strongly consistent, per-user rate limiting with:
 * - Secret API keys (sk_): Skip rate limiting entirely
 * - Publishable keys (pk_): Per-IP rate limiting with Durable Objects
 * 
 * Benefits over KV approach:
 * - Strongly consistent (no race conditions)
 * - Handles parallel requests correctly
 * - Faster (in-memory state)
 * - Per-user isolation
 * 
 * Token bucket configuration:
 * - Capacity: 3 tokens
 * - Refill rate: 1 token per 15 seconds
 * - Allows bursts up to 3 requests
 */
export const frontendKeyRateLimit = createMiddleware<AuthEnv>(async (c, next) => {
    // Skip rate limiting for secret API keys
    const apiKey = c.var?.auth?.apiKey;
    if (apiKey?.metadata?.keyType === "secret") {
        return next();
    }
    
    // Get user identifier (IP address for publishable keys)
    const ip = c.req.header("cf-connecting-ip") || "unknown";
    const userId = `ip:${ip}`;
    
    // Get Durable Object for this user
    const id = c.env.RATE_LIMITER.idFromName(userId);
    const stub = c.env.RATE_LIMITER.get(id);
    
    // Check rate limit
    const result = await stub.checkRateLimit();
    
    // Set rate limit headers
    c.header("RateLimit-Limit", "3");
    c.header("RateLimit-Remaining", result.remaining.toString());
    c.header("RateLimit-Reset", new Date(result.resetTime).toISOString());
    
    if (!result.allowed) {
        return c.json({
            error: "Rate limit exceeded for publishable key. Client-side keys (pk_*) are limited to 3 requests with 1 token refilling every 15 seconds. Use a secret key (sk_*) for server-side applications to bypass rate limits."
        }, 429);
    }
    
    return next();
});
