/**
 * Image cache middleware for enter.pollinations.ai
 * Implements cache-first pattern: check cache before auth/rate limiting
 * Adapted from image.pollinations.ai/cloudflare-cache
 */

import { createMiddleware } from "hono/factory";
import {
    generateCacheKey,
    setHttpMetadataHeaders,
    cacheResponse,
} from "@/utils/image-cache.ts";
import type { LoggerVariables } from "@/middleware/logger.ts";
import { RequestIdVariables } from "hono/request-id";

type ImageCacheEnv = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables & RequestIdVariables;
};

/**
 * Image cache middleware
 * - Checks cache FIRST (before auth/rate limiting)
 * - Returns immediately on cache HIT
 * - On MISS: continues to auth/rate limiting/origin
 * - After origin response: caches it asynchronously
 */
export const imageCache = createMiddleware<ImageCacheEnv>(async (c, next) => {
    const log = c.get("log").getChild("cache");
    const cacheKey = generateCacheKey(new URL(c.req.url));
    log.debug("[CACHE] Cache key: {key}", { key: cacheKey });

    // Try to get from cache
    try {
        const cachedImage = await c.env.IMAGE_BUCKET.get(cacheKey);
        if (cachedImage) {
            log.info("[CACHE] Cache HIT");
            setHttpMetadataHeaders(c, cachedImage.httpMetadata);
            c.header("Cache-Control", "public, max-age=31536000, immutable");
            c.header("X-Cache", "HIT");
            c.header("X-Cache-Type", "EXACT");
            return c.body(cachedImage.body);
        }

        log.debug("[CACHE] Cache MISS");
        c.header("X-Cache", "MISS");
    } catch (error) {
        log.error("[CACHE] Error retrieving cached image: {error}", {
            error,
        });
    }

    // No cache hit, continue to auth/rate limiting/origin
    await next();

    // After response from origin, cache it asynchronously
    const contentType = c.res?.headers.get("content-type");
    const xCache = c.res?.headers.get("x-cache");

    // Cache if: response is OK, is an image or video, and not already a cache hit
    // Note: We don't check Content-Length because responses may use chunked encoding
    const isMediaContent =
        contentType?.includes("image/") || contentType?.includes("video/");
    if (c.res?.ok && isMediaContent && xCache !== "HIT") {
        log.debug("[CACHE] Caching image response");
        c.executionCtx.waitUntil(cacheResponse(cacheKey, c));
    }
});
