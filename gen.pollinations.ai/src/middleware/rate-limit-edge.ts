import { getLogger } from "@logtape/logtape";
import { getRealClientIp } from "@shared/client-ip.ts";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";

type EdgeRateLimiterEnv = {
    Bindings: CloudflareBindings & {
        EDGE_RATE_LIMITER?: RateLimit;
    };
};

/**
 * Edge rate limiter: ~10 req/s per IP (100 requests per 10 seconds)
 *
 * First line of defense before cache/tracking/auth.
 * Uses Cloudflare native rate limiting for zero-overhead protection.
 *
 * Rate limits by IP address to protect backend services from traffic spikes.
 */
export const edgeRateLimit = createMiddleware<EdgeRateLimiterEnv>(
    async (c, next) => {
        if (!c.env.EDGE_RATE_LIMITER) {
            getLogger(["hono", "ratelimit"]).error(
                "EDGE_RATE_LIMITER binding is missing — rate limiting is DISABLED. Add binding to wrangler.toml.",
            );
            throw new HTTPException(503, {
                message: "Rate limiting misconfigured. Contact support.",
            });
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
