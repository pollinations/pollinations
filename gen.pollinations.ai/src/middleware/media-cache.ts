/** Generation request identity and cache policy; Media owns file storage. */

import { IMMUTABLE_CACHE_CONTROL } from "@shared/http/cache-control.ts";
import { SAFETY_HEADER_NAME } from "@shared/schemas/safety.ts";
import type { Context } from "hono";
import { generateCacheKey } from "@/utils/media-cache.ts";
import type { AuthVariables } from "./auth.ts";
import {
    createGenerationCache,
    createGenerationExecutionCache,
    type GenerationCacheAdapter,
    type GenerationCacheEnv,
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

// Best-effort: record the current request's user against a generation's
// media id so it shows up in their private list (GET /media/mine), without
// making the response wait on it. Runs on both a fresh write and a cache
// hit — a hit means someone else's request already produced this exact
// file, and the current requester should still see it in their own list.
// Anonymous requests (no authenticated user) are not linked to anything.
function linkCurrentUserToMedia(c: Context<GenerationCacheEnv>, id: string) {
    const userId = (c.var as typeof c.var & Partial<AuthVariables>).auth?.user
        ?.id;
    if (!userId) return;
    c.executionCtx.waitUntil(
        c.env.MEDIA.linkToUser(id, userId).catch((error) => {
            c.get("log")
                .getChild("media-cache")
                .error("Error linking media to user: {error}", { error });
        }),
    );
}

function mediaCacheAdapter(config: MediaCacheConfig): GenerationCacheAdapter {
    return withLegacyMediaCache({
        storage: "media",
        label: config.label,
        async getKey(c) {
            const variables = c.var as typeof c.var & Partial<ModelVariables>;
            const cacheUrl = new URL(
                c.var.generationCacheUrl ??
                    c.var.generationRequestUrl ??
                    c.req.url,
            );
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
            linkCurrentUserToMedia(c, cacheKey);
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
            const write = c.env.MEDIA.put(cacheKey, stored);
            // Link only after the blob actually exists — chained off `write`
            // rather than run alongside it, so a fresh write can't race
            // linkToUser's R2 head() against the still-in-flight put. Any
            // link failure is swallowed here (already logged internally by
            // linkCurrentUserToMedia) so it never affects `write`'s own
            // resolution, which the caller uses to report caching errors.
            write.then(() => linkCurrentUserToMedia(c, cacheKey)).catch(() => {});
            return {
                response,
                write,
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
