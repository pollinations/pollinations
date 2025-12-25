/**
 * Text cache middleware for enter.pollinations.ai
 * Implements cache-first pattern: check cache before auth/rate limiting
 * Adapted from text.pollinations.ai/cloudflare-cache
 */

import { createMiddleware } from "hono/factory";
import {
    generateCacheKey,
    getCachedResponse,
    createCaptureStream,
} from "@/utils/text-cache.ts";
import type { LoggerVariables } from "@/middleware/logger.ts";
import type { RequestIdVariables } from "hono/request-id";

type TextCacheEnv = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables & RequestIdVariables;
};

// Paths that should NOT be cached
const NON_CACHE_PATHS = ["/models", "/feed", "/openai/models", "/v1/models"];

/**
 * Check if a path should be excluded from caching
 */
function shouldSkipCache(pathname: string): boolean {
    return NON_CACHE_PATHS.some(
        (path) => pathname === path || pathname.endsWith(path),
    );
}

/**
 * Text cache middleware
 * - Checks cache FIRST (before auth/rate limiting)
 * - Returns immediately on cache HIT
 * - On MISS: continues to auth/rate limiting/origin
 * - After origin response: caches it (handles both streaming and non-streaming)
 */
export const textCache = createMiddleware<TextCacheEnv>(async (c, next) => {
    const log = c.get("log").getChild("text-cache");
    const url = new URL(c.req.url);

    // Skip cache for non-cacheable paths
    if (shouldSkipCache(url.pathname)) {
        log.debug("[TEXT-CACHE] Skipping cache (non-cacheable path): {path}", {
            path: url.pathname,
        });
        return next();
    }

    // Read request body for POST/PUT requests (needed for cache key)
    // IMPORTANT: Use c.req.raw.clone().text() to avoid consuming the body
    // so that downstream handlers can still read it with c.req.json()
    let bodyText: string | undefined;
    if (c.req.method === "POST" || c.req.method === "PUT") {
        try {
            bodyText = await c.req.raw.clone().text();
            if (!bodyText) {
                // Empty body for POST/PUT - skip cache to avoid key collision
                log.debug(
                    "[TEXT-CACHE] Empty body for POST/PUT, skipping cache",
                );
                return next();
            }
        } catch {
            // Body read failed - skip cache to avoid key collision
            // All POST /v1/chat/completions would share same key without body
            log.warn(
                "[TEXT-CACHE] Could not read request body, skipping cache",
            );
            return next();
        }
    }

    // Generate cache key
    const cacheKey = await generateCacheKey(c.req.raw, bodyText);
    log.debug("[TEXT-CACHE] Cache key: {key}", {
        key: cacheKey.substring(0, 16) + "...",
    });

    // Try to get from cache
    try {
        const cachedResponse = await getCachedResponse(c, cacheKey);
        if (cachedResponse) {
            log.info("[TEXT-CACHE] Cache HIT");
            return cachedResponse;
        }
        log.debug("[TEXT-CACHE] Cache MISS");
        c.header("X-Cache", "MISS");
    } catch (error) {
        log.error("[TEXT-CACHE] Error retrieving cached response: {error}", {
            error,
        });
    }

    // No cache hit, continue to auth/rate limiting/origin
    await next();

    // After response from origin, cache it
    if (!c.res?.ok) {
        log.debug("[TEXT-CACHE] Not caching non-OK response: {status}", {
            status: c.res?.status,
        });
        return;
    }

    const originalBody = c.res.body;
    if (!originalBody) {
        log.debug("[TEXT-CACHE] No response body to cache");
        return;
    }

    // Use TransformStream for ALL responses (streaming and non-streaming)
    // Non-streaming responses just come through as one or a few chunks
    log.debug("[TEXT-CACHE] Setting up cache capture");

    const captureStream = createCaptureStream(c, cacheKey, c.res);
    const transformedBody = originalBody.pipeThrough(captureStream);

    // Create new response with transformed body and original headers
    c.res = new Response(transformedBody, {
        status: c.res.status,
        statusText: c.res.statusText,
        headers: c.res.headers, // Pass original headers (creates mutable copy)
    });

    // Add cache headers
    c.res.headers.set("X-Cache", "MISS");
    c.res.headers.set("X-Cache-Key", cacheKey.substring(0, 16));
});
