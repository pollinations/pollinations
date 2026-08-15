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
import { getPublicOrigin } from "@shared/public-origin.ts";
import { refreshR2ObjectTtl } from "@shared/r2-storage.ts";
import { SAFETY_HEADER_NAME } from "@shared/schemas/safety.ts";
import {
    decodeMediaCacheId,
    encodeMediaCacheId,
    generateCacheKey,
    putMediaResponse,
    setHttpMetadataHeaders,
} from "@/utils/media-cache.ts";
import {
    createGenerationCache,
    createGenerationExecutionCache,
    type GenerationCacheAdapter,
    hashGenerationCacheIdentity,
} from "./generation-cache.ts";

type MediaCacheConfig = {
    /** Content types to cache, e.g. ["image/", "video/"] or ["audio/"] */
    mediaTypes: string[];
    /** Fallback content type when R2 metadata is missing */
    defaultContentType: string;
    /** Label for log messages */
    label: string;
};

function mediaUrl(
    c: Parameters<GenerationCacheAdapter["getKey"]>[0],
    key: string,
) {
    return new URL(
        `/media/${encodeMediaCacheId(key)}`,
        getPublicOrigin(c),
    ).toString();
}

function mediaCacheAdapter(config: MediaCacheConfig): GenerationCacheAdapter {
    return {
        storage: "media",
        label: config.label,
        async getKey(c) {
            const cacheUrl = c.var.generationCacheUrl ?? new URL(c.req.url);
            if (!c.var.generationCacheUrl && c.var.generationCacheBody) {
                cacheUrl.searchParams.set(
                    "__request_body",
                    await hashGenerationCacheIdentity(
                        "media",
                        c.var.generationCacheBody,
                    ),
                );
            }
            const cacheKey = generateCacheKey(
                cacheUrl,
                c.var.generationCacheUrl
                    ? undefined
                    : c.req.header(SAFETY_HEADER_NAME),
            );
            return cacheKey;
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
            const response = c.body(
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
            response.headers.set("Content-Location", mediaUrl(c, cacheKey));
            return response;
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
            response.headers.set("Content-Location", mediaUrl(c, cacheKey));
            return {
                response,
                write: putMediaResponse(
                    c.env.IMAGE_BUCKET,
                    cacheKey,
                    c,
                    config.defaultContentType,
                    response,
                ),
            };
        },
    };
}

/** Serve an already-generated media-cache object through a bounded public URL. */
export async function serveCachedMedia(
    c: Parameters<GenerationCacheAdapter["getKey"]>[0],
) {
    const cacheKey = decodeMediaCacheId(c.req.param("id"));
    if (!cacheKey) return c.json({ error: "Invalid media id" }, 400);

    const cached = await c.env.IMAGE_BUCKET.get(cacheKey);
    if (!cached) return c.json({ error: "Media not found" }, 404);

    setHttpMetadataHeaders(
        c,
        cached.httpMetadata,
        "application/octet-stream",
        cached.customMetadata,
    );
    c.header("Cache-Control", IMMUTABLE_CACHE_CONTROL);
    c.header("Content-Location", mediaUrl(c, cacheKey));
    c.header("X-Cache", "HIT");
    return c.body(
        refreshR2ObjectTtl(
            c.env.IMAGE_BUCKET,
            cacheKey,
            cached,
            (promise) => c.executionCtx.waitUntil(promise),
            (error) => {
                c.get("log").error(
                    "Error refreshing public media TTL: {error}",
                    { error },
                );
            },
        ),
    );
}

const imageAdapter = mediaCacheAdapter({
    mediaTypes: ["image/", "video/"],
    defaultContentType: "image/jpeg",
    label: "image-cache",
});
export const imageCache = createGenerationCache(imageAdapter);
export const imageExecutionCache = createGenerationExecutionCache(imageAdapter);

const audioAdapter = mediaCacheAdapter({
    mediaTypes: ["audio/"],
    defaultContentType: "audio/mpeg",
    label: "audio-cache",
});
export const audioCache = createGenerationCache(audioAdapter);
export const audioExecutionCache = createGenerationExecutionCache(audioAdapter);

const model3dAdapter = mediaCacheAdapter({
    mediaTypes: ["model/"],
    defaultContentType: "model/gltf-binary",
    label: "3d-cache",
});
export const model3dCache = createGenerationCache(model3dAdapter);
export const model3dExecutionCache =
    createGenerationExecutionCache(model3dAdapter);
