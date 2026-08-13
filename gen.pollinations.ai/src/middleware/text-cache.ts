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
import {
    createGenerationCache,
    createGenerationExecutionCache,
    type GenerationCacheAdapter,
} from "./generation-cache.ts";

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
            bodyText = await c.req.text();
        }

        return generateCacheKey(c.req.raw, bodyText);
    },
    get: getCachedResponse,
    shouldCache(response) {
        return response.status === 200 && response.body !== null;
    },
    capture(c, cacheKey, response) {
        const capture = createCaptureStream(c, cacheKey, response);
        const transformedBody = response.body?.pipeThrough(capture.stream);
        const captured = new Response(transformedBody, {
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

export const textCache = createGenerationCache(textCacheAdapter);
export const textExecutionCache =
    createGenerationExecutionCache(textCacheAdapter);
