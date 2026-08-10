import type { Logger } from "@logtape/logtape";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { RequestIdVariables } from "hono/request-id";
import type { LoggerVariables } from "@/middleware/logger.ts";

export type GenerationCacheEnv = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables & RequestIdVariables;
};

export type GenerationCacheAdapter = {
    label: string;
    getKey: (
        c: Context<GenerationCacheEnv>,
        log: Logger,
    ) => Promise<string | null> | string | null;
    get: (
        c: Context<GenerationCacheEnv>,
        key: string,
    ) => Promise<Response | null>;
    shouldCache: (response: Response) => boolean;
    capture: (
        c: Context<GenerationCacheEnv>,
        key: string,
        response: Response,
    ) => Response;
};

/** Shared cache lifecycle; storage and serialization stay adapter-owned. */
export function createGenerationCache(adapter: GenerationCacheAdapter) {
    return createMiddleware<GenerationCacheEnv>(async (c, next) => {
        const log = c.get("log").getChild(adapter.label);
        const cacheKey = await adapter.getKey(c, log);
        if (!cacheKey) return next();

        log.debug("Cache key: {key}", { key: cacheKey });
        try {
            const cached = await adapter.get(c, cacheKey);
            if (cached) {
                log.info("Cache HIT");
                return cached;
            }
            log.debug("Cache MISS");
            c.header("X-Cache", "MISS");
        } catch (error) {
            log.error("Error retrieving cached response: {error}", { error });
        }

        await next();

        if (c.res && adapter.shouldCache(c.res)) {
            log.debug("Caching response");
            c.res = adapter.capture(c, cacheKey, c.res);
        }
    });
}
