/**
 * Image cache middleware for gen.pollinations.ai
 * Copied from enter with Env type adapted.
 */

import { createMiddleware } from "hono/factory";
import type { Env } from "../env.ts";
import {
    cacheResponse,
    generateCacheKey,
    setHttpMetadataHeaders,
} from "../utils/image-cache.ts";

export const imageCache = createMiddleware<Env>(async (c, next) => {
    const seedParam = new URL(c.req.url).searchParams.get("seed");
    if (seedParam === "-1") {
        return next();
    }

    const cacheKey = generateCacheKey(new URL(c.req.url));

    try {
        const cachedImage = await c.env.IMAGE_BUCKET.get(cacheKey);
        if (cachedImage) {
            setHttpMetadataHeaders(c, cachedImage.httpMetadata);
            c.header("Cache-Control", "public, max-age=31536000, immutable");
            c.header("X-Cache", "HIT");
            c.header("X-Cache-Type", "EXACT");
            return c.body(cachedImage.body);
        }
        c.header("X-Cache", "MISS");
    } catch {
        // Cache read failure is non-fatal
    }

    await next();

    const contentType = c.res?.headers.get("content-type");
    const xCache = c.res?.headers.get("x-cache");
    const isMediaContent =
        contentType?.includes("image/") || contentType?.includes("video/");
    if (c.res?.ok && isMediaContent && xCache !== "HIT") {
        c.executionCtx.waitUntil(cacheResponse(cacheKey, c));
    }
});
