import { getRealClientIp } from "@shared/client-ip.ts";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";

type EdgeRateLimiterEnv = {
    Bindings: CloudflareBindings & {
        EDGE_RATE_LIMITER?: RateLimit;
    };
};

/**
 * Edge rate limiter: 1,000 req/s per IP (10,000 requests per 10 seconds)
 *
 * The limit is set per deploy environment in wrangler.toml
 * ([[env.<name>.ratelimits]] EDGE_RATE_LIMITER); keep this comment in sync.
 *
 * First line of defense before cache/tracking/auth.
 * Uses Cloudflare native rate limiting for zero-overhead protection.
 *
 * Rate limits by IP address to protect backend services from traffic spikes.
 * It is a flood shield, not a user quota: per-key Pollen limits live in the
 * PollenRateLimiter durable object.
 */
export const edgeRateLimit = createMiddleware<EdgeRateLimiterEnv>(
    async (c, next) => {
        if (!c.env.EDGE_RATE_LIMITER) {
            return next();
        }
        const ip = getRealClientIp(c);

        const { success } = await c.env.EDGE_RATE_LIMITER.limit({ key: ip });

        if (!success) {
            throw new HTTPException(429, {
                message: "Too many requests from this IP. Please slow down.",
            });
        }

        await next();
    },
);
