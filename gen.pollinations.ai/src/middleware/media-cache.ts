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
import { SAFETY_HEADER_NAME } from "@shared/schemas/safety.ts";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { RequestIdVariables } from "hono/request-id";
import type { LoggerVariables } from "@/middleware/logger.ts";
import {
    cacheMediaResponse,
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

const MEDIA_CATALOG_URL = "https://media.pollinations.ai/catalog";
const CATALOG_CONTROL_PARAMS = [
    "key",
    "save",
    "catalog",
    "tag",
    "tags",
    "visibility",
];

export function createMediaCache(config: MediaCacheConfig) {
    return createMiddleware<MediaCacheEnv>(async (c, next) => {
        const log = c.get("log").getChild(config.label);
        const requestUrl = new URL(c.req.url);

        const seedParam = requestUrl.searchParams.get("seed");
        if (seedParam === "-1") {
            log.debug("seed=-1 detected, skipping cache");
            return next();
        }

        const cacheKey = generateCacheKey(
            new URL(c.req.url),
            c.req.header(SAFETY_HEADER_NAME),
        );
        log.debug("Cache key: {key}", { key: cacheKey });

        try {
            const cached = await c.env.IMAGE_BUCKET.get(cacheKey);
            if (cached) {
                log.info("Cache HIT");
                queueMediaCatalogWrite(
                    c,
                    requestUrl,
                    cached.httpMetadata?.contentType ||
                        config.defaultContentType,
                );
                setHttpMetadataHeaders(
                    c,
                    cached.httpMetadata,
                    config.defaultContentType,
                    cached.customMetadata,
                );
                c.header("Cache-Control", IMMUTABLE_CACHE_CONTROL);
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
            cacheMediaResponse(
                c.env.IMAGE_BUCKET,
                cacheKey,
                c,
                config.defaultContentType,
                c.res,
            );
            queueMediaCatalogWrite(
                c,
                requestUrl,
                contentType || config.defaultContentType,
            );
        }
    });
}

function queueMediaCatalogWrite(
    c: Context<MediaCacheEnv>,
    requestUrl: URL,
    contentType: string,
): void {
    if (!shouldCatalog(requestUrl)) return;

    const apiKey = extractApiKey(c.req.raw, requestUrl);
    if (!apiKey) return;

    const canonicalUrl = new URL(requestUrl);
    for (const param of CATALOG_CONTROL_PARAMS) {
        canonicalUrl.searchParams.delete(param);
    }

    const tags = extractTags(requestUrl);
    const model = requestUrl.searchParams.get("model");
    const prompt = promptFromPath(requestUrl.pathname);
    const body = {
        url: canonicalUrl.toString(),
        visibility: normalizeVisibility(
            requestUrl.searchParams.get("visibility"),
        ),
        tags,
        contentType,
        ...(model && { model }),
        ...(prompt && { prompt }),
    };

    c.header("X-Media-Catalog", "queued");
    c.executionCtx.waitUntil(
        fetch(MEDIA_CATALOG_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(body),
        })
            .then(async (response) => {
                if (response.ok) return;
                const text = await response.text().catch(() => "");
                c.get("log").warn(
                    "Media catalog write failed with status {status}: {body}",
                    {
                        status: response.status,
                        body: text.slice(0, 200),
                    },
                );
            })
            .catch((error) => {
                c.get("log").warn("Media catalog write failed: {error}", {
                    error,
                });
            }),
    );
}

function shouldCatalog(url: URL): boolean {
    const value =
        url.searchParams.get("save") || url.searchParams.get("catalog");
    return value === "1" || value === "true" || value === "yes";
}

function extractApiKey(request: Request, url: URL): string | null {
    const bearer = request.headers
        .get("authorization")
        ?.match(/^Bearer (.+)$/)?.[1];
    if (bearer) return bearer;
    return url.searchParams.get("key");
}

function normalizeVisibility(
    value: string | null,
): "private" | "public" | "unlisted" {
    return value === "public" || value === "unlisted" ? value : "private";
}

function extractTags(url: URL): string[] {
    const tags = [
        ...url.searchParams.getAll("tag"),
        ...url.searchParams.getAll("tags").flatMap((value) => value.split(",")),
    ]
        .map((tag) => tag.trim())
        .filter(Boolean);
    return [...new Set(tags)];
}

function promptFromPath(pathname: string): string | undefined {
    const match = pathname.match(/^\/(?:image|video|audio)\/(.+)$/);
    if (!match) return undefined;
    try {
        return decodeURIComponent(match[1]);
    } catch {
        return match[1];
    }
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
