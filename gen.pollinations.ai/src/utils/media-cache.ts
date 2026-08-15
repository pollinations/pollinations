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
const MAX_MEDIA_CACHE_KEY_LENGTH = 1_000;
const CACHED_HEADER_PREFIXES = ["x-safety-", "x-usage-"];
const CACHED_HEADER_NAMES = [
    "content-disposition",
    "content-security-policy",
    "x-content-type-options",
    "x-elevenlabs-reference-song-id",
    "x-elevenlabs-song-id",
    "x-fallback-target",
    "x-model-used",
    "x-tts-voice",
    "x-voice-changer-voice",
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
        if (!EXCLUDED_PARAMS.includes(key.toLowerCase())) {
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

/** Encode an internal media-cache key as a bounded, URL-safe public id. */
export function encodeMediaCacheId(cacheKey: string): string {
    let binary = "";
    for (const byte of new TextEncoder().encode(cacheKey)) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

/** Decode a public media id without allowing access outside cache-key bounds. */
export function decodeMediaCacheId(id: string): string | null {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;

    try {
        const base64 = id.replace(/-/g, "+").replace(/_/g, "/");
        const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
        const binary = atob(padded);
        const bytes = Uint8Array.from(binary, (character) =>
            character.charCodeAt(0),
        );
        const cacheKey = new TextDecoder("utf-8", { fatal: true }).decode(
            bytes,
        );
        return cacheKey.length > 0 &&
            cacheKey.length <= MAX_MEDIA_CACHE_KEY_LENGTH
            ? cacheKey
            : null;
    } catch {
        return null;
    }
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

export async function putMediaResponse<TEnv extends MediaCacheEnv>(
    bucket: R2Bucket,
    cacheKey: string,
    c: Context<TEnv>,
    defaultContentType: string,
    response: Response,
): Promise<void> {
    const body = await response.clone().arrayBuffer();
    if (body.byteLength === 0) {
        c.get("log").warn("Skipping empty media cache write for {cacheKey}", {
            cacheKey,
        });
        throw new Error("Refusing to cache an empty media response");
    }

    await bucket.put(cacheKey, body, {
        httpMetadata: removeUnset({
            contentType:
                response.headers.get("content-type") || defaultContentType,
        } as R2HTTPMetadata),
        customMetadata: prepareCustomMetadata(response),
    });
}
