/**
 * Image caching utilities for gen.pollinations.ai
 * Copied from enter.pollinations.ai with minimal changes.
 */

import type { Context } from "hono";

export function generateCacheKey(url: URL): string {
    const normalizedUrl = new URL(url);
    const params = Array.from(normalizedUrl.searchParams.entries()).sort(
        ([keyA], [keyB]) => keyA.localeCompare(keyB),
    );

    normalizedUrl.search = "";
    params.forEach(([key, value]) => {
        if (!["nofeed", "no-cache", "key"].includes(key)) {
            normalizedUrl.searchParams.append(key, value);
        }
    });

    const fullPath = normalizedUrl.pathname + normalizedUrl.search;
    const hash = createHash(fullPath);
    const safePath = fullPath.replace(/[/\s?=&]/g, "_");
    const maxPathLength = 990;
    const trimmedPath = safePath.substring(0, maxPathLength);

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
    httpMetadata?: R2HTTPMetadata,
) {
    if (httpMetadata) {
        for (const [key, value] of Object.entries(httpMetadata)) {
            if (!value) continue;
            const headerName = key.replace(/([A-Z])/g, "-$1").toLowerCase();
            c.header(headerName, value);
        }
    } else {
        c.header("Content-Type", "image/jpeg");
    }
}

export async function cacheResponse(
    cacheKey: string,
    c: Context,
): Promise<boolean> {
    try {
        const imageBuffer = await c.res.clone().arrayBuffer();
        const contentType = c.res.headers.get("content-type") || "image/jpeg";
        const metadata = {
            httpMetadata: { contentType } as R2HTTPMetadata,
            customMetadata: {
                cachedAt: new Date().toISOString(),
            },
        };
        await (c.env as any).IMAGE_BUCKET.put(cacheKey, imageBuffer, metadata);
        return true;
    } catch {
        return false;
    }
}
