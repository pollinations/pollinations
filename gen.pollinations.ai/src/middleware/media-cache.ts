/**
 * Generic media cache middleware for gen.pollinations.ai
 * Checks cache after auth/balance checks.
 * Used for image, video, and audio GET endpoints.
 *
 * Currently uses IMAGE_BUCKET (R2) for all media types.
 * Cache keys are namespaced by URL path so there are no collisions.
 * TODO: Rename to MEDIA_BUCKET when ready to consolidate.
 */

import { createMiddleware } from "hono/factory";
import type { RequestIdVariables } from "hono/request-id";
import type { LoggerVariables } from "@/middleware/logger.ts";
import {
    cacheResponse,
    generateCacheKey,
    setHttpMetadataHeaders,
} from "@/utils/media-cache.ts";

type MediaCacheEnv = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables & RequestIdVariables;
};

type MediaCacheConfig = {
    /** Content types to cache, e.g. ["image/", "video/"] or ["audio/"] */
    mediaTypes: string[];
    /** Fallback content type when R2 metadata is missing */
    defaultContentType: string;
    /** Label for log messages */
    label: string;
};

export function createMediaCache(config: MediaCacheConfig) {
    return createMiddleware<MediaCacheEnv>(async (c, next) => {
        const log = c.get("log").getChild(config.label);

        const seedParam = new URL(c.req.url).searchParams.get("seed");
        if (seedParam === "-1") {
            log.debug("seed=-1 detected, skipping cache");
            return next();
        }

        const cacheKey = generateCacheKey(new URL(c.req.url));
        log.debug("Cache key: {key}", { key: cacheKey });

        try {
            const cached = await c.env.IMAGE_BUCKET.get(cacheKey);
            if (cached) {
                log.info("Cache HIT");
                setHttpMetadataHeaders(
                    c,
                    cached.httpMetadata,
                    config.defaultContentType,
                );
                c.header(
                    "Cache-Control",
                    "public, max-age=31536000, immutable",
                );
                c.header("X-Cache", "HIT");
                c.header("X-Cache-Type", "EXACT");
                return c.body(cached.body);
            }

            log.debug("Cache MISS");
            c.header("X-Cache", "MISS");
        } catch (error) {
            log.error("Error retrieving cached response: {error}", { error });
        }

        await next();

        const contentType = c.res?.headers.get("content-type");
        const xCache = c.res?.headers.get("x-cache");

        const isMatchingContent = config.mediaTypes.some((type) =>
            contentType?.includes(type),
        );
        if (c.res?.ok && isMatchingContent && xCache !== "HIT") {
            log.debug("Caching response");
            c.executionCtx.waitUntil(
                cacheResponse(
                    c.env.IMAGE_BUCKET,
                    cacheKey,
                    c,
                    config.defaultContentType,
                ),
            );
        }
    });
}

export const imageCache = createMediaCache({
    mediaTypes: ["image/", "video/"],
    defaultContentType: "image/jpeg",
    label: "image-cache",
});

export const audioCache = createMediaCache({
    mediaTypes: ["audio/"],
    defaultContentType: "audio/mpeg",
    label: "audio-cache",
});
