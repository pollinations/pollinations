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
 * - Time-based with pollen units (not request counts)
 * - Refill rate: 1 pollen per hour (steady-state throughput)
 * - Identifier: pk_{apiKeyId}:ip:{ip} (prevents abuse via key + IP)
 * - Pre-request check (sets 30s timeout)
 * - Post-request deduction (actual pollen cost overwrites timeout)
 */
export const frontendKeyRateLimit = createMiddleware<
    FrontendKeyRateLimitEnv & Env
>(async (c, next) => {
    const log = c.get("log").getChild("ratelimit");

    // Only apply to publishable keys
    const apiKey = c.var?.auth?.apiKey;
    if (apiKey?.metadata?.keyType !== "publishable") {
        log.debug("Skipping rate limit, not a publishable key");
        return next();
    }

    // Get composite identifier: pk_{apiKeyId}:ip:{ip}
    const ip = c.req.header("cf-connecting-ip") || "unknown";
    const identifier = `pk_${apiKey.id}:ip:${ip}`;

    log.debug(
        "Applying rate limit for publishable key: id={keyId} ip={ip} identifier={identifier}",
        {
            keyId: apiKey.id,
            ip,
            identifier,
        },
    );

    // Get Durable Object for this (key + IP) combination
    const id = c.env.POLLEN_RATE_LIMITER.idFromName(identifier);
    const stub = c.env.POLLEN_RATE_LIMITER.get(
        id,
    ) as DurableObjectStub<PollenRateLimiter>;

    // Check pollen rate limit
    const result = await stub.checkRateLimit();

    if (!result.allowed) {
        const retryAfterSeconds = safeRound((result.waitMs || 0) / 1000, 2);
        c.header("Retry-After", Math.ceil(retryAfterSeconds).toString());
        // TODO: Change this to throw an error to get consistent error responses
        return c.json(
            {
                error: "Rate limit exceeded",
                message: `Rate limit exceeded. Retry after ${retryAfterSeconds}s. Use secret keys (sk_*) for unlimited requests.`,
                retryAfterSeconds: retryAfterSeconds,
            },
            429,
        );
    }

    c.set("frontendKeyRateLimit", {
        consumePollen: (cost: number) => stub.consumePollen(cost),
    });

    await next();
});
