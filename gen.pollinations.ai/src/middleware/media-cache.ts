/** Generation request identity and cache policy; Media owns file storage. */

import { IMMUTABLE_CACHE_CONTROL } from "@shared/http/cache-control.ts";
import { SAFETY_HEADER_NAME } from "@shared/schemas/safety.ts";
import { generateCacheKey } from "@/utils/media-cache.ts";
import {
    createGenerationCache,
    createGenerationExecutionCache,
    type GenerationCacheAdapter,
    hashGenerationCacheIdentity,
} from "./generation-cache.ts";
import { withLegacyMediaCache } from "./legacy-media-cache.ts";
import { getRequiredSafetyFeatures, type ModelVariables } from "./model.ts";

type MediaCacheConfig = {
    /** Content types to cache, e.g. ["image/", "video/"] or ["audio/"] */
    mediaTypes: string[];
    /** Label for log messages */
    label: string;
};

// Preserve file/generation metadata, not headers tied to an individual request.
const CACHED_HEADERS = new Set([
    "content-type",
    "content-disposition",
    "content-security-policy",
    "x-content-type-options",
    "song-id",
    "x-elevenlabs-reference-song-id",
    "x-elevenlabs-song-id",
    "x-generation-id",
    "x-fallback-target",
    "x-model-used",
    "x-tts-voice",
    "x-voice-changer-voice",
]);

function mediaCacheAdapter(config: MediaCacheConfig): GenerationCacheAdapter {
    return withLegacyMediaCache({
        storage: "media",
        label: config.label,
        async getKey(c) {
            const variables = c.var as typeof c.var & Partial<ModelVariables>;
            const cacheUrl = new URL(c.var.generationRequestUrl ?? c.req.url);
            if (c.var.generationCacheBody) {
                cacheUrl.searchParams.set(
                    "__request_body",
                    await hashGenerationCacheIdentity(
                        "media",
                        c.var.generationCacheBody,
                    ),
                );
            }
            return generateCacheKey(
                cacheUrl,
                c.req.header(SAFETY_HEADER_NAME),
                getRequiredSafetyFeatures(variables.model),
            );
        },
        async get(c, cacheKey) {
            const response = await c.env.MEDIA.get(cacheKey);
            if (!response) return null;
            response.headers.set("Cache-Control", IMMUTABLE_CACHE_CONTROL);
            response.headers.set("X-Cache", "HIT");
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
            const stored = new Response(response.clone().body, response);
            for (const name of [...stored.headers.keys()]) {
                if (
                    !CACHED_HEADERS.has(name) &&
                    !name.startsWith("x-safety-") &&
                    !name.startsWith("x-usage-")
                ) {
                    stored.headers.delete(name);
                }
            }
            return {
                response,
                write: c.env.MEDIA.put(cacheKey, stored),
            };
        },
    });
}

const imageAdapter = mediaCacheAdapter({
    mediaTypes: ["image/", "video/"],
    label: "image-cache",
});
export const imageCache = createGenerationCache(imageAdapter);
export const imageExecutionCache = createGenerationExecutionCache(imageAdapter);

const audioAdapter = mediaCacheAdapter({
    mediaTypes: ["audio/"],
    label: "audio-cache",
});
export const audioCache = createGenerationCache(audioAdapter);
export const audioExecutionCache = createGenerationExecutionCache(audioAdapter);

const model3dAdapter = mediaCacheAdapter({
    mediaTypes: ["model/"],
    label: "3d-cache",
});
export const model3dCache = createGenerationCache(model3dAdapter);
export const model3dExecutionCache =
    createGenerationExecutionCache(model3dAdapter);
