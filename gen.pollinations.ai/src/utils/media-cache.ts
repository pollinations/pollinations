/**
 * Generic media caching utilities for gen.pollinations.ai
 * Used by both image and audio cache middleware.
 * Hashes the complete request identity without exposing prompts in media URLs.
 */

import { bytesToHex } from "@shared/client-ip.ts";
import {
    parseSafeFeatures,
    type SafetyFeature,
} from "@shared/schemas/safety.ts";

// "nofeed" is a removed/no-op param kept here on purpose: external and
// community clients still send `?nofeed=true`, and excluding it from the
// cache key prevents those requests from fragmenting the cache. "no-cache"
// and "key" are request controls that must never affect the cache key.
export const EXCLUDED_PARAMS = ["nofeed", "no-cache", "key"];
export const SAFETY_CACHE_VERSION = "bedrock-input-v1";

function hasActiveSafety(value: string | null | undefined): boolean {
    return parseSafeFeatures(value).size > 0;
}

export async function generateCacheKey(
    url: URL,
    safeHeader?: string | null,
    requiredSafetyFeatures: readonly SafetyFeature[] = [],
): Promise<string> {
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
    if (requiredSafetyFeatures.length > 0) {
        normalizedUrl.searchParams.append(
            "__required_safety",
            [...new Set(requiredSafetyFeatures)].sort().join(","),
        );
    }
    if (usesSafety || usesHeaderSafety || requiredSafetyFeatures.length > 0) {
        normalizedUrl.searchParams.append("__safety", SAFETY_CACHE_VERSION);
    }

    const fullPath = normalizedUrl.pathname + normalizedUrl.search;
    return bytesToHex(
        await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(fullPath),
        ),
    );
}
