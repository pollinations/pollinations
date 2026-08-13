import { bytesToHex } from "@shared/client-ip.ts";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { RequestIdVariables } from "hono/request-id";
import type { LoggerVariables } from "@/middleware/logger.ts";
import { registerGenerationCacheWrite } from "@/utils/generation-executor-context.ts";

export type GenerationCacheStorage = "media" | "text";

/** Opaque identity shared by coordination and low-volume cache telemetry. */
export async function hashGenerationCacheIdentity(
    storage: GenerationCacheStorage,
    key: string,
): Promise<string> {
    const bytes = new TextEncoder().encode(`${storage}:${key}`);
    return bytesToHex(await crypto.subtle.digest("SHA-256", bytes));
}

export type GenerationCacheVariables = {
    generationCache?: {
        adapter: GenerationCacheAdapter;
        key: string;
    };
    /** Alternate request identity for routes which wrap a media response. */
    generationCacheUrl?: URL;
    /** Normalized body to persist when detached execution must replay a POST. */
    generationReplayBody?: string;
};

export type GenerationCacheEnv = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables & RequestIdVariables & GenerationCacheVariables;
};

export type GenerationCacheAdapter = {
    storage: GenerationCacheStorage;
    label: string;
    getKey: (c: Context<GenerationCacheEnv>) => Promise<string> | string;
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

function replaceCapturedResponse(
    c: Context<GenerationCacheEnv>,
    captured: Response,
): void {
    if (captured === c.res) return;
    // Hono's response setter gives the previous response headers precedence.
    // Copy adapter-owned headers first so they survive the body replacement.
    for (const [name, value] of captured.headers) {
        c.res.headers.set(name, value);
    }
    c.res = captured;
}

/** Shared cache lifecycle; storage and serialization stay adapter-owned. */
export function createGenerationCache(adapter: GenerationCacheAdapter) {
    return createMiddleware<GenerationCacheEnv>(async (c, next) => {
        const log = c.get("log").getChild(adapter.label);
        const cacheKey = await adapter.getKey(c);
        const streamRequested = (
            c.var as GenerationCacheEnv["Variables"] & {
                track?: { streamRequested?: boolean };
            }
        ).track?.streamRequested;
        const coordinate = streamRequested !== true;

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
            if (coordinate) {
                return new Response(
                    "Generation cache is temporarily unavailable",
                    { status: 503 },
                );
            }
        }

        if (coordinate) {
            c.set("generationCache", { adapter, key: cacheKey });
        }

        await next();

        // A coordinator response was already materialized in R2. Do not make
        // every joined caller rewrite it or extend its cache lifetime.
        if (
            c.res &&
            c.res.headers.get("X-Cache") !== "HIT" &&
            adapter.shouldCache(c.res)
        ) {
            log.debug("Caching response");
            const capture = adapter.capture(c, cacheKey, c.res);
            c.executionCtx.waitUntil(
                capture.write.catch((error) => {
                    log.error("Error caching response: {error}", { error });
                }),
            );
            replaceCapturedResponse(c, capture.response);
        }
    });
}

/** Cache lifecycle used only by the detached generation executor. */
export function createGenerationExecutionCache(
    adapter: GenerationCacheAdapter,
) {
    return createMiddleware<GenerationCacheEnv>(async (c, next) => {
        const log = c.get("log").getChild(adapter.label);
        const cacheKey = await adapter.getKey(c);

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
            return new Response("Generation cache is temporarily unavailable", {
                status: 503,
            });
        }

        c.set("generationCache", { adapter, key: cacheKey });
        await next();

        if (
            c.res &&
            c.res.headers.get("X-Cache") !== "HIT" &&
            adapter.shouldCache(c.res)
        ) {
            log.debug("Caching response");
            const capture = adapter.capture(c, cacheKey, c.res);
            registerGenerationCacheWrite(c.executionCtx, capture.write);
            replaceCapturedResponse(c, capture.response);
        }
    });
}
