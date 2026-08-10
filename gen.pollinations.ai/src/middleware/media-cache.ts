/**
 * Generic media cache middleware for gen.pollinations.ai
 * Checks cache before auth/balance checks so cache hits can remain public.
 * Used for image, video, and audio GET endpoints.
 *
 * Currently uses IMAGE_BUCKET (R2) for all media types.
 * Cache keys are namespaced by URL path so there are no collisions.
 * TODO: Rename to MEDIA_BUCKET when ready to consolidate.
 */

import type { Logger } from "@logtape/logtape";
import { IMMUTABLE_CACHE_CONTROL } from "@shared/http/cache-control.ts";
import { refreshR2ObjectTtl } from "@shared/r2-storage.ts";
import { SAFETY_HEADER_NAME } from "@shared/schemas/safety.ts";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { RequestIdVariables } from "hono/request-id";
import type { LoggerVariables } from "@/middleware/logger.ts";
import {
    acquireGenerationLease,
    cacheMediaResponse,
    generateCacheKey,
    leaseKeyFor,
    releaseGenerationLease,
    setHttpMetadataHeaders,
} from "@/utils/media-cache.ts";

/**
 * How long a joined caller waits for the in-flight generation before it is
 * told to come back.
 *
 * This must stay below the smallest edge read timeout in front of this worker
 * (gen is served from both a free and an Enterprise zone), so that we answer
 * with a 202 rather than the edge answering with a 524. 75s leaves margin
 * against the ~100s free-zone default.
 */
const JOIN_BUDGET_MS = 75_000;
const JOIN_POLL_INITIAL_MS = 250;
const JOIN_POLL_MAX_MS = 2_000;
const RETRY_AFTER_SECONDS = 5;

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

        const cacheKey = generateCacheKey(
            new URL(c.req.url),
            c.req.header(SAFETY_HEADER_NAME),
        );
        log.debug("Cache key: {key}", { key: cacheKey });

        const serveCached = (cached: R2ObjectBody, cacheType: string) => {
            setHttpMetadataHeaders(
                c,
                cached.httpMetadata,
                config.defaultContentType,
                cached.customMetadata,
            );
            c.header("Cache-Control", IMMUTABLE_CACHE_CONTROL);
            c.header("X-Cache", "HIT");
            c.header("X-Cache-Type", cacheType);
            return c.body(
                refreshR2ObjectTtl(
                    c.env.IMAGE_BUCKET,
                    cacheKey,
                    cached,
                    (promise) => c.executionCtx.waitUntil(promise),
                    (error) => {
                        log.error("Error refreshing media cache TTL: {error}", {
                            error,
                        });
                    },
                ),
            );
        };

        try {
            const cached = await c.env.IMAGE_BUCKET.get(cacheKey);
            if (cached) {
                log.info("Cache HIT");
                return serveCached(cached, "EXACT");
            }

            log.debug("Cache MISS");
            c.header("X-Cache", "MISS");
        } catch (error) {
            log.error("Error retrieving cached response: {error}", { error });
        }

        const isGenerator = await acquireGenerationLease(
            c.env.IMAGE_BUCKET,
            cacheKey,
            log,
        );

        if (!isGenerator) {
            log.info("Joining in-flight generation for {cacheKey}", {
                cacheKey,
            });
            const joined = await waitForGeneratedMedia(
                c.env.IMAGE_BUCKET,
                cacheKey,
                log,
            );
            if (joined) return serveCached(joined, "COALESCED");
            return pendingResponse(c);
        }

        // Hand the generation to waitUntil before awaiting it, so a client
        // that gives up does not cancel the work it already paid for. The
        // result still lands in R2 and the caller's retry is a free hit.
        const generation = next();
        c.executionCtx.waitUntil(generation.catch(() => {}));
        try {
            await generation;
        } catch (error) {
            await releaseGenerationLease(c.env.IMAGE_BUCKET, cacheKey, log);
            throw error;
        }

        const write = writeBack(c, config, cacheKey, log);
        if (write) {
            // Hold the lease until the object exists, or a joiner released
            // early would see neither a lease nor an object and generate again.
            c.executionCtx.waitUntil(
                write.finally(() =>
                    releaseGenerationLease(c.env.IMAGE_BUCKET, cacheKey, log),
                ),
            );
        } else {
            await releaseGenerationLease(c.env.IMAGE_BUCKET, cacheKey, log);
        }
    });
}

/**
 * Persists the response when it is cacheable media. Returns the write promise
 * so a lease holder can keep the lease until the object is readable, or
 * undefined when there is nothing to cache.
 */
function writeBack(
    c: Context<MediaCacheEnv>,
    config: MediaCacheConfig,
    cacheKey: string,
    log: Logger,
): Promise<void> | undefined {
    const contentType = c.res?.headers.get("content-type");
    const xCache = c.res?.headers.get("x-cache");
    const isMatchingContent = config.mediaTypes.some((type) =>
        contentType?.includes(type),
    );
    if (!c.res?.ok || !isMatchingContent || xCache === "HIT") return undefined;

    log.debug("Caching response");
    const { response, write } = cacheMediaResponse(
        c.env.IMAGE_BUCKET,
        cacheKey,
        c,
        config.defaultContentType,
        c.res,
    );
    // Swap in the client's half of the tee'd body.
    c.res = response;
    return write;
}

/**
 * Polls for the object the current generation holder is producing. Gives up
 * early when the lease disappears without an object, which means that attempt
 * failed and this caller should be told to retry rather than keep waiting.
 */
async function waitForGeneratedMedia(
    bucket: R2Bucket,
    cacheKey: string,
    log: Logger,
): Promise<R2ObjectBody | null> {
    const deadline = Date.now() + JOIN_BUDGET_MS;
    let delay = JOIN_POLL_INITIAL_MS;

    while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * 1.5, JOIN_POLL_MAX_MS);

        try {
            const cached = await bucket.get(cacheKey);
            if (cached) return cached;
            const lease = await bucket.head(leaseKeyFor(cacheKey));
            if (!lease) {
                log.info(
                    "Joined generation ended without media for {cacheKey}",
                    {
                        cacheKey,
                    },
                );
                return null;
            }
        } catch (error) {
            log.error("Error polling for joined generation: {error}", {
                error,
            });
            return null;
        }
    }
    return null;
}

/**
 * Emitted where the edge would otherwise time the caller out. Unlike a 524
 * this says the work was accepted and is still running, so retrying the same
 * URL is both safe and free.
 */
function pendingResponse(c: Context<MediaCacheEnv>): Response {
    return c.body(null, 202, {
        "Retry-After": String(RETRY_AFTER_SECONDS),
        "Cache-Control": "no-store",
        "X-Cache": "MISS",
        "X-Cache-Type": "PENDING",
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
