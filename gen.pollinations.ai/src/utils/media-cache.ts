/**
 * Generic media caching utilities for gen.pollinations.ai
 * Used by both image and audio cache middleware.
 * Stores binary responses in R2 with URL-based cache keys.
 */

import type { Logger } from "@logtape/logtape";
import { parseSafeFeatures } from "@shared/schemas/safety.ts";
import { removeUnset } from "@shared/util.ts";
import type { Context } from "hono";
import { GENERATION_BUDGET_MS } from "@/image/util.ts";

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
 * Splits a media response: the client gets one half, the cache the other.
 *
 * `tee()` rather than `clone()`, with our branch consumed immediately. A
 * cloned Response signals backpressure at the rate of the *faster* consumer,
 * so a branch nobody reads makes workerd buffer the whole body with no limit.
 * Under `clone()` the cache write was therefore only as reliable as the
 * client's willingness to read — invisible for the fully buffered image,
 * video and 3D handlers, but the audio routes pass the provider's stream
 * straight through, so a caller that hung up could stall the write and the
 * media was silently never cached.
 *
 * Returns the write promise as well, because the single-flight lease holder
 * must keep its lease until the object is actually readable.
 */
export function cacheMediaResponse<TEnv extends MediaCacheEnv>(
    bucket: R2Bucket,
    cacheKey: string,
    c: Context<TEnv>,
    defaultContentType: string,
    response: Response,
): { response: Response; write: Promise<void> } {
    if (!response.body) {
        return { response, write: Promise.resolve() };
    }

    const [clientBody, cacheBody] = response.body.tee();
    const write = storeMediaBody(
        bucket,
        cacheKey,
        c.get("log"),
        defaultContentType,
        cacheBody,
        response,
    );
    return { response: new Response(clientBody, response), write };
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

// --- Single-flight generation lease -----------------------------------------
//
// R2 conditional writes give us an atomic create-if-absent: `put` with
// `onlyIf: { etagDoesNotMatch: "*" }` resolves to an R2Object when this call
// created the object and to null when it already existed. That is enough to
// elect exactly one generator per cache key without any new binding.
//
// The lease is deliberately advisory: it is released as soon as the media
// object exists (or the attempt fails), and it self-expires so a worker that
// dies mid-generation cannot wedge a key forever.

/**
 * Derived, not chosen: a lease that expires while its holder is still polling
 * a provider would let a second caller start a duplicate paid generation. It
 * therefore has to outlive the longest generation we allow, plus room for the
 * download and the R2 write.
 */
export const LEASE_TTL_MS = GENERATION_BUDGET_MS + 60_000;

export function leaseKeyFor(cacheKey: string): string {
    return `${cacheKey}.lease`;
}

/**
 * Returns true when this caller is now the sole generator for `cacheKey`.
 *
 * Fails closed: any R2 error (including the 429 R2 returns when a key is
 * written more than once per second) is reported as "someone else holds it",
 * never as "go ahead and generate". Duplicating a paid generation is worse
 * than making a caller wait.
 */
export async function acquireGenerationLease(
    bucket: R2Bucket,
    cacheKey: string,
    log: Logger,
): Promise<boolean> {
    const leaseKey = leaseKeyFor(cacheKey);
    try {
        const created = await bucket.put(leaseKey, "", {
            onlyIf: { etagDoesNotMatch: "*" },
            customMetadata: { startedAt: new Date().toISOString() },
        });
        if (created) return true;

        // A lease exists. Take it over if it is older than the TTL, which means
        // its holder died without releasing.
        const existing = await bucket.head(leaseKey);
        if (!existing) return false;
        const startedAt = Date.parse(
            existing.customMetadata?.startedAt ??
                existing.uploaded.toISOString(),
        );
        if (Number.isNaN(startedAt) || Date.now() - startedAt < LEASE_TTL_MS) {
            return false;
        }

        const takenOver = await bucket.put(leaseKey, "", {
            onlyIf: { etagMatches: existing.etag },
            customMetadata: { startedAt: new Date().toISOString() },
        });
        if (takenOver) {
            log.warn("Took over expired generation lease for {cacheKey}", {
                cacheKey,
            });
        }
        return takenOver !== null;
    } catch (error) {
        log.error("Error acquiring generation lease: {error}", { error });
        return false;
    }
}

export async function releaseGenerationLease(
    bucket: R2Bucket,
    cacheKey: string,
    log: Logger,
): Promise<void> {
    try {
        await bucket.delete(leaseKeyFor(cacheKey));
    } catch (error) {
        log.error("Error releasing generation lease: {error}", { error });
    }
}
