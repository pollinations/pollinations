/**
 * Generic media caching utilities for gen.pollinations.ai
 * Used by both image and audio cache middleware.
 * Stores binary responses in R2 with URL-based cache keys.
 */

import type { Logger } from "@logtape/logtape";
import { parseSafeFeatures } from "@shared/schemas/safety.ts";
import type { Context } from "hono";
import { removeUnset } from "@/util.ts";

const EXCLUDED_PARAMS = ["nofeed", "no-cache", "key"];
const SAFETY_CACHE_VERSION = "bedrock-input-v1";

function hasActiveSafety(value: string | null): boolean {
    return parseSafeFeatures(value).size > 0;
}

export function generateCacheKey(url: URL): string {
    const normalizedUrl = new URL(url);
    const usesSafety = hasActiveSafety(normalizedUrl.searchParams.get("safe"));
    const params = Array.from(normalizedUrl.searchParams.entries()).sort(
        ([keyA], [keyB]) => keyA.localeCompare(keyB),
    );

    normalizedUrl.search = "";
    for (const [key, value] of params) {
        if (!EXCLUDED_PARAMS.includes(key)) {
            normalizedUrl.searchParams.append(key, value);
        }
    }
    if (usesSafety) {
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
}

type MediaCacheEnv = {
    Bindings: CloudflareBindings;
    Variables: {
        requestId: string;
        log: Logger;
    };
};

export function cacheMediaResponse<TEnv extends MediaCacheEnv>(
    bucket: R2Bucket,
    cacheKey: string,
    c: Context<TEnv>,
    defaultContentType: string,
    response: Response,
): void {
    c.executionCtx.waitUntil(
        response
            .clone()
            .arrayBuffer()
            .then((body) => {
                if (body.byteLength === 0) {
                    c.get("log").warn(
                        "Skipping empty media cache write for {cacheKey}",
                        { cacheKey },
                    );
                    return null;
                }

                return bucket.put(cacheKey, body, {
                    httpMetadata: removeUnset({
                        contentType:
                            response.headers.get("content-type") ||
                            defaultContentType,
                    } as R2HTTPMetadata),
                    customMetadata: {
                        cachedAt: new Date().toISOString(),
                    },
                });
            })
            .catch((error) => {
                c.get("log").error("Error caching response: {error}", {
                    error,
                });
            }),
    );
}
