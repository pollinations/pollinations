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
import { getRequiredSafetyFeatures, type ModelVariables } from "./model.ts";

type MediaCacheConfig = {
    /** Content types to cache, e.g. ["image/", "video/"] or ["audio/"] */
    mediaTypes: string[];
    /** Label for log messages */
    label: string;
};

function mediaCacheAdapter(config: MediaCacheConfig): GenerationCacheAdapter {
    return {
        storage: "media",
        label: config.label,
        async getKey(c) {
            const variables = c.var as typeof c.var & Partial<ModelVariables>;
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
            return generateCacheKey(
                cacheUrl,
                c.var.generationCacheUrl
                    ? undefined
                    : c.req.header(SAFETY_HEADER_NAME),
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
            return {
                response,
                write: c.env.MEDIA.put(cacheKey, response.clone()),
            };
        },
    };
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
