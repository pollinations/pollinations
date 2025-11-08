import { createMiddleware } from "hono/factory";
import type { AuthVariables } from "./auth.ts";
import { PollenRateLimiter } from "@/durable-objects/PollenRateLimiter.ts";
import type { LoggerVariables } from "@/middleware/logger.ts";
import { safeRound } from "@/util.ts";
import { Env } from "@/env.ts";

export type FrontendKeyRateLimitVariables = {
    // will be undefined when using a secret api key
    frontendKeyRateLimit?: {
        consumePollen: (totalPrice: number) => Promise<void>;
    };
};

type FrontendKeyRateLimitEnv = {
    Bindings: CloudflareBindings;
    Variables: AuthVariables & LoggerVariables & FrontendKeyRateLimitVariables;
};

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
export const frontendKeyRateLimit = createMiddleware<
    FrontendKeyRateLimitEnv & Env
>(async (c, next) => {
    const log = c.get("log");

    // Only apply to publishable keys
    const apiKey = c.var?.auth?.apiKey;
    if (apiKey?.metadata?.keyType !== "publishable") {
        log.debug("[RATE_LIMIT] Skipping rate limit, not a publishable key");
        return next();
    }

    log.debug("[RATE_LIMIT] Applying rate limit for publishable key: {keyId}", {
        keyId: apiKey.id,
    });

    // Get composite identifier: pk_{apiKeyId}:ip:{ip}
    const ip = c.req.header("cf-connecting-ip") || "unknown";
    const identifier = `pk_${apiKey.id}:ip:${ip}`;

    // Get Durable Object for this (key + IP) combination
    const id = c.env.POLLEN_RATE_LIMITER.idFromName(identifier);
    const stub = c.env.POLLEN_RATE_LIMITER.get(
        id,
    ) as DurableObjectStub<PollenRateLimiter>;

    // Check pollen rate limit
    const result = await stub.checkRateLimit();

    // Set rate limit headers (pollen units)
    const capacity = c.env.POLLEN_BUCKET_CAPACITY ?? 0.1;
    c.header("RateLimit-Limit", capacity.toString());
    c.header("RateLimit-Remaining", result.remaining.toFixed(4)); // Current pollen

    if (!result.allowed) {
        // rate limit exhaustion
        if (result.waitMs !== undefined) {
            const retryAfterSeconds = safeRound(result.waitMs / 1000, 2);
            c.header("Retry-After", Math.ceil(retryAfterSeconds).toString());
            // TODO: Change this to throw an error to get consistent error responses
            return c.json(
                {
                    error: "Rate limit exceeded",
                    message: [
                        `Rate limit bucket exhausted (${result.remaining.toFixed(2)}/${capacity}).`,
                        `Retry after ${retryAfterSeconds}s. Use secret keys (sk_*) for unlimited requests.`,
                    ].join(" "),
                    retryAfterSeconds: retryAfterSeconds,
                    rateLimitRemaining: safeRound(result.remaining, 2),
                },
                429,
            );
        }
        // concurrent request: no wait time
        c.header("Retry-After", "0");
        // TODO: Change this to throw an error to get consistent error responses
        return c.json(
            {
                error: "Concurrent request in progress",
                message:
                    "Another request is currently being processed. Please wait until it finishes.",
                rateLimitRemaining: safeRound(result.remaining, 2),
            },
            429,
        );
    }

    c.set("frontendKeyRateLimit", {
        consumePollen: stub.consumePollen,
    });

    await next();
});
