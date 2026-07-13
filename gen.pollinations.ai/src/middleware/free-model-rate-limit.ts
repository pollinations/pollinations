import { getRealClientIp } from "@shared/client-ip.ts";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { PollenRateLimiter } from "@/durable-objects/PollenRateLimiter.ts";
import type { LoggerVariables } from "@/middleware/logger.ts";
import type { ModelVariables } from "@/middleware/model.ts";

const FREE_MODEL_LIMITS: Record<
    string,
    { intervalMs: number; displayName: string }
> = {
    sana: { intervalMs: 45_000, displayName: "Sana" },
    "gpt-oss": { intervalMs: 30_000, displayName: "GPT-OSS" },
};

type FreeModelRateLimitEnv = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables & ModelVariables;
};

export async function enforceFreeModelRateLimit<
    TEnv extends FreeModelRateLimitEnv,
>(c: Context<TEnv>): Promise<void> {
    const model = c.var.model.resolved;
    const config = FREE_MODEL_LIMITS[model];
    if (!config) return;

    const namespace = c.env.POLLEN_RATE_LIMITER;
    if (!namespace) {
        c.var.log.error("Free model rate limit binding is missing", { model });
        throw new HTTPException(503, {
            message: `${config.displayName} is temporarily unavailable`,
        });
    }

    const ip = getRealClientIp(c as Context);
    const id = namespace.idFromName(`free-model:${model}:ip:${ip}`);
    const stub = namespace.get(id) as DurableObjectStub<PollenRateLimiter>;
    const result = await stub.checkAndConsumeInterval(config.intervalMs);
    if (result.allowed) return;

    const retryAfterSeconds = Math.max(
        1,
        Math.ceil((result.waitMs ?? config.intervalMs) / 1000),
    );
    c.header("Retry-After", String(retryAfterSeconds));
    throw new HTTPException(429, {
        message: `${config.displayName} is limited to one request per IP every ${config.intervalMs / 1000} seconds. Retry after ${retryAfterSeconds}s.`,
    });
}

export const freeModelRateLimit = createMiddleware<FreeModelRateLimitEnv>(
    async (c, next) => {
        await enforceFreeModelRateLimit(c);
        await next();
    },
);
