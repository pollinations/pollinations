/**
 * Generic media caching utilities for gen.pollinations.ai
 * Used by both image and audio cache middleware.
 * Stores binary responses in R2 with URL-based cache keys.
 */

import type { Logger } from "@logtape/logtape";
import { parseSafeFeatures } from "@shared/schemas/safety.ts";
import { removeUnset } from "@shared/util.ts";
import type { Context } from "hono";

// "nofeed" is a removed/no-op param kept here on purpose: external and
// community clients still send `?nofeed=true`, and excluding it from the
// cache key prevents those requests from fragmenting the cache. "no-cache"
// and "key" are request controls that must never affect the cache key.
export const EXCLUDED_PARAMS = ["nofeed", "no-cache", "key"];
export const SAFETY_CACHE_VERSION = "bedrock-input-v1";
const CACHED_HEADER_PREFIXES = ["x-safety-"];
const CACHED_HEADER_NAMES = [
    "content-disposition",
    "content-security-policy",
    "x-content-type-options",
];

function hasActiveSafety(value: string | null | undefined): boolean {
    return parseSafeFeatures(value).size > 0;
}

export function generateCacheKey(url: URL, safeHeader?: string | null): string {
    const normalizedUrl = new URL(url);
    const hasQuerySafe = normalizedUrl.searchParams.has("safe");
    const usesSafety = hasActiveSafety(normalizedUrl.searchParams.get("safe"));
    const usesHeaderSafety = !hasQuerySafe && hasActiveSafety(safeHeader);
    const params = Array.from(normalizedUrl.searchParams.entries()).sort(
        ([keyA], [keyB]) => keyA.localeCompare(keyB),
    );

    normalizedUrl.search = "";
    for (const [key, value] of params) {
        if (!EXCLUDED_PARAMS.includes(key)) {
            normalizedUrl.searchParams.append(key, value);
        }
    }
    if (safeHeader !== undefined && safeHeader !== null && !hasQuerySafe) {
        normalizedUrl.searchParams.append("__safe_header", safeHeader);
    }
    if (usesSafety || usesHeaderSafety) {
        normalizedUrl.searchParams.append("__safety", SAFETY_CACHE_VERSION);
    }

    const fullPath = normalizedUrl.pathname + normalizedUrl.search;
    const hash = createHash(fullPath);
    const safePath = fullPath.replace(/[/\s?=&]/g, "_");
    const trimmedPath = safePath.substring(0, 990);

    return `${trimmedPath}-${hash}`;
}

function createHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16).substring(0, 8);
}

export function setHttpMetadataHeaders(
    c: Context,
    httpMetadata: R2HTTPMetadata | undefined,
    defaultContentType: string,
    customMetadata?: Record<string, string>,
) {
    if (httpMetadata) {
        for (const [key, value] of Object.entries(httpMetadata)) {
            if (!value) continue;
            const headerName = key.replace(/([A-Z])/g, "-$1").toLowerCase();
            c.header(headerName, value);
        }
    } else {
        c.header("Content-Type", defaultContentType);
    }

    for (const [key, value] of Object.entries(customMetadata ?? {})) {
        if (key.startsWith("header_")) {
            c.header(key.slice("header_".length), value);
        }
    }
}

function prepareCustomMetadata(response: Response): Record<string, string> {
    const metadata: Record<string, string> = {
        cachedAt: new Date().toISOString(),
    };
    for (const [name, value] of response.headers.entries()) {
        const lowerName = name.toLowerCase();
        if (
            CACHED_HEADER_NAMES.includes(lowerName) ||
            CACHED_HEADER_PREFIXES.some((prefix) =>
                lowerName.startsWith(prefix),
            )
        ) {
            metadata[`header_${lowerName}`] = value;
        }
    }
    return metadata;
}

type MediaCacheEnv = {
    Bindings: CloudflareBindings;
    Variables: {
        requestId: string;
        log: Logger;
    };
};

/**
 * Caches a media response and returns the response to send to the client.
 *
 * The body is split with `tee()` rather than `clone()`, and our branch is
 * consumed immediately. That matters because a cloned Response signals
 * backpressure at the rate of the *faster* consumer: if one branch is never
 * read, workerd buffers the whole body with no limit. Under `clone()` the
 * cache write was therefore only as reliable as the client's willingness to
 * read — fine for the fully buffered image/video/3D handlers, but for the
 * audio routes, which pass the provider's stream straight through, a caller
 * that hung up could stall the write and the media was silently never cached.
 *
 * Reading our branch ourselves makes the write independent of the client, so
 * every media type caches the same way.
 */
export function cacheMediaResponse<TEnv extends MediaCacheEnv>(
    bucket: R2Bucket,
    cacheKey: string,
    c: Context<TEnv>,
    defaultContentType: string,
    response: Response,
): Response {
    if (!response.body) return response;

    const [clientBody, cacheBody] = response.body.tee();
    c.executionCtx.waitUntil(
        storeMediaBody(
            bucket,
            cacheKey,
            c.get("log"),
            defaultContentType,
            cacheBody,
            response,
        ),
    );
    return new Response(clientBody, response);
}

async function storeMediaBody(
    bucket: R2Bucket,
    cacheKey: string,
    log: Logger,
    defaultContentType: string,
    body: ReadableStream<Uint8Array>,
    source: Response,
): Promise<void> {
    try {
        const buffered = await new Response(body).arrayBuffer();
        if (buffered.byteLength === 0) {
            log.warn("Skipping empty media cache write for {cacheKey}", {
                cacheKey,
            });
            return;
        }

        await bucket.put(cacheKey, buffered, {
            httpMetadata: removeUnset({
                contentType:
                    source.headers.get("content-type") || defaultContentType,
            } as R2HTTPMetadata),
            customMetadata: prepareCustomMetadata(source),
        });
    } catch (error) {
        log.error("Error caching response: {error}", { error });
    }
}
