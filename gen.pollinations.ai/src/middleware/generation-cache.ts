import type { Logger } from "@logtape/logtape";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { RequestIdVariables } from "hono/request-id";
import type { LoggerVariables } from "@/middleware/logger.ts";
import {
    canCoordinateGeneration,
    coordinateGeneration,
    INTERNAL_CACHE_WRITE_HEADER,
    isGenerationExecution,
} from "@/utils/idempotent-generation.ts";

export type GenerationCacheEnv = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables & RequestIdVariables;
};

export type GenerationCacheAdapter = {
    namespace: string;
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
    ) => { response: Response; write: Promise<void> };
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
            if (
                canCoordinateGeneration(c) ||
                isGenerationExecution(c.executionCtx)
            ) {
                return new Response(
                    "Generation cache is temporarily unavailable",
                    {
                        status: 503,
                    },
                );
            }
        }

        const coordinated = await coordinateGeneration(c, adapter, cacheKey);
        if (coordinated) return coordinated;

        await next();

        if (c.res && adapter.shouldCache(c.res)) {
            log.debug("Caching response");
            const capture = adapter.capture(c, cacheKey, c.res);
            const internal = isGenerationExecution(c.executionCtx);
            c.executionCtx.waitUntil(
                internal
                    ? capture.write
                    : capture.write.catch((error) => {
                          log.error("Error caching response: {error}", {
                              error,
                          });
                      }),
            );
            c.res = capture.response;
            if (internal) {
                c.res.headers.set(INTERNAL_CACHE_WRITE_HEADER, "1");
            }
        }
    });
}
