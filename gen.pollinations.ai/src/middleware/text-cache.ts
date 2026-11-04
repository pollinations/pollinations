/**
 * Text cache middleware for gen.pollinations.ai
 * Implements cache lookup before access checks.
 * Adapted from gen.pollinations.ai/cloudflare-cache
 */

import { IMMUTABLE_CACHE_CONTROL } from "@shared/http/cache-control.ts";
import {
    createCaptureStream,
    generateCacheKey,
    getCachedResponse,
} from "@/utils/text-cache.ts";
import type { AuthVariables } from "./auth.ts";
import {
    createGenerationCache,
    createGenerationExecutionCache,
    type GenerationCacheAdapter,
} from "./generation-cache.ts";
import { getRequiredSafetyFeatures, type ModelVariables } from "./model.ts";

/**
 * Text cache middleware
 * - Checks cache before auth/balance checks so cache hits can remain public
 * - Returns immediately on cache HIT
 * - On MISS: continues to auth/rate limiting/origin
 * - After origin response: caches it (handles both streaming and non-streaming)
 *
 * Note: Only apply this middleware to cacheable routes (e.g., /v1/chat/completions, /text/:prompt)
 * Non-cacheable routes like /v1/models should NOT use this middleware
 */
const textCacheAdapter: GenerationCacheAdapter = {
    storage: "text",
    label: "text-cache",
    async getKey(c) {
        // Hono caches body text across c.req.json()/text(), so this still works
        // after upstream validators have parsed JSON.
        let bodyText: string | undefined;
        if (c.req.method === "POST" || c.req.method === "PUT") {
            bodyText = c.var.generationCacheBody ?? (await c.req.text());
        }

        const variables = c.var as typeof c.var &
            Partial<AuthVariables & ModelVariables>;
        const seed =
            c.req.method === "GET" || c.req.method === "HEAD"
                ? Number(c.req.query("seed"))
                : (
                      c.req.valid("json" as never) as
                          | { seed?: number }
                          | undefined
                  )?.seed;
        if (seed === -1) {
            c.set("textSeedScope", c.var.textSeedScope ?? crypto.randomUUID());
        }
        // Agent runs and random seeds get their own entries. Keep the entry
        // so the coordinator can still deliver a non-streaming result.
        const cacheScope = variables.model?.cacheScope;
        const partition = cacheScope
            ? `${cacheScope}:key:${variables.auth?.apiKey?.id ?? "anonymous"}:run:${c.var.textSeedScope ?? c.var.requestId}`
            : c.var.textSeedScope;
        return generateCacheKey(
            c.req.raw,
            bodyText,
            partition,
            getRequiredSafetyFeatures(variables.model),
        );
    },
    get: getCachedResponse,
    shouldCache(response) {
        return response.status === 200 && response.body !== null;
    },
    capture(c, cacheKey, response) {
        const capture = createCaptureStream(c, cacheKey, response);
        const captured = new Response(capture.stream, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
        });
        captured.headers.set("X-Cache", "MISS");
        captured.headers.set("X-Cache-Key", cacheKey.substring(0, 16));
        captured.headers.set("Cache-Control", IMMUTABLE_CACHE_CONTROL);
        return { response: captured, write: capture.write };
    },
};

const cacheText = createGenerationCache(textCacheAdapter);
export const textCache: typeof cacheText = async (c, next) => {
    const response = await cacheText(c, next);
    if (response) c.res = response;
    if (c.var.textSeedScope) {
        c.header("Cache-Control", "private, no-store");
    }
};
export const textExecutionCache =
    createGenerationExecutionCache(textCacheAdapter);
