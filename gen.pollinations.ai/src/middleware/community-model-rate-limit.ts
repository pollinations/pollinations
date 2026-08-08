import { getRealClientIp } from "@shared/client-ip.ts";
import { communityEndpointPerUserRateLimitRpm } from "@shared/community-endpoints.ts";
import { createMiddleware } from "hono/factory";
import type { CommunityModelRateLimiter } from "@/durable-objects/CommunityModelRateLimiter.ts";
import type { AuthVariables } from "@/middleware/auth.ts";
import type { LoggerVariables } from "@/middleware/logger.ts";
import type { ModelVariables } from "@/middleware/model.ts";
import { safeRound } from "@/util.ts";

type CommunityModelRateLimitEnv = {
    Bindings: CloudflareBindings;
    Variables: ModelVariables & AuthVariables & LoggerVariables;
};

/**
 * Per-caller rate limit for community model calls.
 *
 * Community models share one upstream credential per model, so without this a
 * single heavy caller can exhaust that upstream's quota and surface 502s to
 * every other user. Each caller (user, else API key, else IP) is capped at a
 * fixed share of the endpoint's declared upstream RPM (see
 * communityEndpointPerUserRateLimitRpm). Runs after resolveModel so the
 * community endpoint is known, and is independent of the edge IP limiter.
 */
export const communityModelRateLimit =
    createMiddleware<CommunityModelRateLimitEnv>(async (c, next) => {
        const log = c.get("log").getChild("community-ratelimit");

        const endpoint = c.var.model?.communityEndpoint;
        if (!endpoint) {
            log.debug("Skipping rate limit, not a community model");
            return next();
        }

        const user = c.var.auth?.user;
        const apiKey = c.var.auth?.apiKey;
        const ip = getRealClientIp(c);
        const callerId = user?.id ?? apiKey?.id ?? `ip:${ip}`;
        const callerType = user ? "user" : apiKey ? "apiKey" : "ip";
        const identifier = `${callerType}:${callerId}:endpoint:${endpoint.id}`;

        const limit = communityEndpointPerUserRateLimitRpm(endpoint);

        log.debug(
            "Applying community rate limit: identifier={identifier} limit={limit}",
            { identifier, limit },
        );

        const rateLimiter = c.env.COMMUNITY_MODEL_RATE_LIMITER;
        if (!rateLimiter) {
            log.warn(
                "Skipping community rate limit, COMMUNITY_MODEL_RATE_LIMITER binding is missing",
                { identifier },
            );
            return next();
        }

        const id = rateLimiter.idFromName(identifier);
        const stub = rateLimiter.get(
            id,
        ) as DurableObjectStub<CommunityModelRateLimiter>;
        const result = await stub.checkRateLimit(limit);

        if (!result.allowed) {
            const retryAfterSeconds = safeRound(
                (result.retryAfterMs || 0) / 1000,
                2,
            );
            c.header("Retry-After", Math.ceil(retryAfterSeconds).toString());
            return c.json(
                {
                    error: "Rate limit exceeded",
                    message: `Rate limit exceeded for this community model. Retry after ${retryAfterSeconds}s.`,
                    retryAfterSeconds,
                },
                429,
            );
        }

        await next();
    });
