/**
 * Generic media caching utilities for gen.pollinations.ai
 * Used by both image and audio cache middleware.
 * Stores binary responses in R2 with URL-based cache keys.
 */

import type { Logger } from "@logtape/logtape";
import type { Context } from "hono";
import { removeUnset } from "@/util.ts";

const EXCLUDED_PARAMS = ["nofeed", "no-cache", "key"];

export function generateCacheKey(url: URL): string {
    const normalizedUrl = new URL(url);
    const params = Array.from(normalizedUrl.searchParams.entries()).sort(
        ([keyA], [keyB]) => keyA.localeCompare(keyB),
    );

    normalizedUrl.search = "";
    for (const [key, value] of params) {
        if (!EXCLUDED_PARAMS.includes(key)) {
            normalizedUrl.searchParams.append(key, value);
        }
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

export async function cacheResponse<TEnv extends MediaCacheEnv>(
    bucket: R2Bucket,
    cacheKey: string,
    c: Context<TEnv>,
    defaultContentType: string,
): Promise<boolean> {
    try {
        const buffer = await c.res.clone().arrayBuffer();
        await bucket.put(cacheKey, buffer, {
            httpMetadata: removeUnset({
                contentType:
                    c.res.headers.get("content-type") || defaultContentType,
            } as R2HTTPMetadata),
            customMetadata: {
                cachedAt: new Date().toISOString(),
            },
        });
        return true;
    } catch (error) {
        c.get("log").error("Error caching response: {error}", { error });
        return false;
    }
}
