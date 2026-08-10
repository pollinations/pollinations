/**
 * Generic media cache middleware for gen.pollinations.ai
 * Checks cache before auth/balance checks so cache hits can remain public.
 * Used for image, video, and audio GET endpoints.
 *
 * Currently uses IMAGE_BUCKET (R2) for all media types.
 * Cache keys are namespaced by URL path so there are no collisions.
 * TODO: Rename to MEDIA_BUCKET when ready to consolidate.
 */

import { IMMUTABLE_CACHE_CONTROL } from "@shared/http/cache-control.ts";
import { refreshR2ObjectTtl } from "@shared/r2-storage.ts";
import { SAFETY_HEADER_NAME } from "@shared/schemas/safety.ts";
import {
    cacheMediaResponse,
    generateCacheKey,
    setHttpMetadataHeaders,
} from "@/utils/media-cache.ts";
import { createGenerationCache } from "./generation-cache.ts";

type MediaCacheConfig = {
    /** Content types to cache, e.g. ["image/", "video/"] or ["audio/"] */
    mediaTypes: string[];
    /** Fallback content type when R2 metadata is missing */
    defaultContentType: string;
    /** Label for log messages */
    label: string;
};

export function createMediaCache(config: MediaCacheConfig) {
    return createGenerationCache({
        label: config.label,
        getKey(c, log) {
            const seedParam = new URL(c.req.url).searchParams.get("seed");
            if (seedParam === "-1") {
                log.debug("seed=-1 detected, skipping cache");
                return null;
            }
            return generateCacheKey(
                new URL(c.req.url),
                c.req.header(SAFETY_HEADER_NAME),
            );
        },
        async get(c, cacheKey) {
            const cached = await c.env.IMAGE_BUCKET.get(cacheKey);
            if (!cached) return null;

            setHttpMetadataHeaders(
                c,
                cached.httpMetadata,
                config.defaultContentType,
                cached.customMetadata,
            );
            c.header("Cache-Control", IMMUTABLE_CACHE_CONTROL);
            c.header("X-Cache", "HIT");
            c.header("X-Cache-Type", "EXACT");
            return c.body(
                refreshR2ObjectTtl(
                    c.env.IMAGE_BUCKET,
                    cacheKey,
                    cached,
                    (promise) => c.executionCtx.waitUntil(promise),
                    (error) => {
                        c.get("log").error(
                            "Error refreshing media cache TTL: {error}",
                            { error },
                        );
                    },
                ),
            );
        },
        shouldCache(response) {
            const contentType = response.headers.get("content-type");
            return (
                response.ok &&
                response.headers.get("x-cache") !== "HIT" &&
                config.mediaTypes.some((type) => contentType?.includes(type))
            );
        },
        capture(c, cacheKey, response) {
            cacheMediaResponse(
                c.env.IMAGE_BUCKET,
                cacheKey,
                c,
                config.defaultContentType,
                response,
            );
            return response;
        },
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

export const model3dCache = createMediaCache({
    mediaTypes: ["model/"],
    defaultContentType: "model/gltf-binary",
    label: "3d-cache",
});
