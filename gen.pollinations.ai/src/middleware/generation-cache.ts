import type { Logger } from "@logtape/logtape";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { RequestIdVariables } from "hono/request-id";
import type { LoggerVariables } from "@/middleware/logger.ts";

export type GenerationCacheEnv = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables & RequestIdVariables & GenerationCacheVariables;
};

export type GenerationCacheVariables = {
    /** Alternate request identity for routes which wrap a media response. */
    generationCacheUrl?: URL;
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
            const captured = adapter.capture(c, cacheKey, c.res);
            if (captured !== c.res) {
                // Hono's response setter gives the previous response headers
                // precedence. Copy adapter-owned headers onto that response
                // first so cache headers survive the body replacement.
                for (const [name, value] of captured.headers) {
                    c.res.headers.set(name, value);
                }
                c.res = captured;
            }
        }
    });
}
