import { getRealClientIp } from "@shared/client-ip.ts";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { PollenRateLimiter } from "@/durable-objects/PollenRateLimiter.ts";
import type { LoggerVariables } from "@/middleware/logger.ts";
import type { ModelVariables } from "@/middleware/model.ts";

const SANA_INTERVAL_MS = 45_000;

type SanaRateLimitEnv = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables & ModelVariables;
};

export async function enforceSanaRateLimit<TEnv extends SanaRateLimitEnv>(
    c: Context<TEnv>,
): Promise<void> {
    if (c.var.model.resolved !== "sana") return;

    const namespace = c.env.POLLEN_RATE_LIMITER;
    if (!namespace) {
        c.var.log.error("Sana rate limit binding is missing");
        throw new HTTPException(503, {
            message: "Sana is temporarily unavailable",
        });
    }

    const ip = getRealClientIp(c as Context);
    const id = namespace.idFromName(`free-model:sana:ip:${ip}`);
    const stub = namespace.get(id) as DurableObjectStub<PollenRateLimiter>;
    const result = await stub.checkAndConsumeInterval(SANA_INTERVAL_MS);
    if (result.allowed) return;

    const retryAfterSeconds = Math.max(
        1,
        Math.ceil((result.waitMs ?? SANA_INTERVAL_MS) / 1000),
    );
    c.header("Retry-After", String(retryAfterSeconds));
    throw new HTTPException(429, {
        message: `Sana is limited to one request per IP every 45 seconds. Retry after ${retryAfterSeconds}s.`,
    });
}

export const sanaRateLimit = createMiddleware<SanaRateLimitEnv>(
    async (c, next) => {
        await enforceSanaRateLimit(c);
        await next();
    },
);
