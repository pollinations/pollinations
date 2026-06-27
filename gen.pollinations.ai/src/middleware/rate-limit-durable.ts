import {
    isPublishableKeyMetadata,
    PUBLISHABLE_API_KEY_PREFIX,
} from "@shared/auth/api-key-metadata.ts";
import { getRealClientIp } from "@shared/client-ip.ts";
import type { LoggerVariables } from "@shared/middleware/logger.ts";
import { createMiddleware } from "hono/factory";
import type { PollenRateLimiter } from "@/durable-objects/PollenRateLimiter.ts";
import type { AuthVariables } from "@/middleware/auth.ts";
import { safeRound } from "@/util.ts";

export type FrontendKeyRateLimitVariables = {
    frontendKeyRateLimit?: {
        consumePollen: (totalPrice: number) => Promise<void>;
    };
};

type FrontendKeyRateLimitEnv = {
    Bindings: CloudflareBindings;
    Variables: AuthVariables & LoggerVariables & FrontendKeyRateLimitVariables;
};

export const frontendKeyRateLimit = createMiddleware<FrontendKeyRateLimitEnv>(
    async (c, next) => {
        const log = c.get("log").getChild("ratelimit");

        const apiKey = c.var?.auth?.apiKey;
        if (!apiKey) {
            log.debug("Skipping rate limit, no API key");
            return next();
        }
        if (!isPublishableKeyMetadata(apiKey.metadata)) {
            log.debug("Skipping rate limit, not a publishable key");
            return next();
        }

        const ip = getRealClientIp(c);
        const identifier = `${PUBLISHABLE_API_KEY_PREFIX}_${apiKey.id}:ip:${ip}`;

        log.debug(
            "Applying rate limit for publishable key: id={keyId} ip={ip} identifier={identifier}",
            {
                keyId: apiKey.id,
                ip,
                identifier,
            },
        );

        const rateLimiter = c.env.POLLEN_RATE_LIMITER;
        if (!rateLimiter) {
            log.warn(
                "Skipping rate limit for publishable key, POLLEN_RATE_LIMITER binding is missing",
                { keyId: apiKey.id, ip, identifier },
            );
            return next();
        }

        const id = rateLimiter.idFromName(identifier);
        const stub = rateLimiter.get(
            id,
        ) as DurableObjectStub<PollenRateLimiter>;
        const result = await stub.checkRateLimit();

        if (!result.allowed) {
            const retryAfterSeconds = safeRound((result.waitMs || 0) / 1000, 2);
            c.header("Retry-After", Math.ceil(retryAfterSeconds).toString());
            return c.json(
                {
                    error: "Rate limit exceeded",
                    message: `Rate limit exceeded. Retry after ${retryAfterSeconds}s. Use secret keys (sk_*) for unlimited requests.`,
                    retryAfterSeconds,
                },
                429,
            );
        }

        c.set("frontendKeyRateLimit", {
            consumePollen: (cost: number) => stub.consumePollen(cost),
        });

        await next();
    },
);
