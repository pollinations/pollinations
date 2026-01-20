/**
 * Image caching utilities for enter.pollinations.ai
 * Adapted from image.pollinations.ai/cloudflare-cache
 * Following the "thin proxy" design principle - keeping logic simple and minimal
 */

import type { Context } from "hono";
import { removeUnset } from "@/util.ts";
import { Logger } from "@logtape/logtape";

/**
 * Generate a consistent cache key from URL
 * @param {URL} url - The URL object
 * @returns {string} - The cache key
 */
export function generateCacheKey(url: URL): string {
    // Normalize the URL by sorting query parameters
    const normalizedUrl = new URL(url);
    const params = Array.from(normalizedUrl.searchParams.entries()).sort(
        ([keyA], [keyB]) => keyA.localeCompare(keyB),
    );

    // Clear and re-add sorted parameters
    normalizedUrl.search = "";
    params.forEach(([key, value]) => {
        // Skip certain parameters that shouldn't affect caching
        if (!["nofeed", "no-cache", "key"].includes(key)) {
            normalizedUrl.searchParams.append(key, value);
        }
    });

    // Get the full path with query parameters
    const fullPath = normalizedUrl.pathname + normalizedUrl.search;

    // Create a hash of the full URL for uniqueness
    const hash = createHash(fullPath);

    // Replace problematic characters in the path
    const safePath = fullPath.replace(/[/\s?=&]/g, "_");

    // Combine path with hash, ensuring it fits within a safe limit (1000 bytes)
    // Allow 10 chars for the hash and hyphen
    const maxPathLength = 990;
    const trimmedPath = safePath.substring(0, maxPathLength);

    return `${trimmedPath}-${hash}`;
}

/**
 * Create a simple hash of a string
 * @param {string} str - The string to hash
 * @returns {string} - The hashed string
 */
function createHash(str: string): string {
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32bit integer
    }

    // Convert to hex string (8 characters should be sufficient)
    return Math.abs(hash).toString(16).substring(0, 8);
}

/**
 * Helper function to set HTTP metadata headers from R2 object
 */
export function setHttpMetadataHeaders(
    c: Context,
    httpMetadata?: R2HTTPMetadata,
) {
    if (httpMetadata) {
        // Iterate over all httpMetadata and set headers
        for (const [key, value] of Object.entries(httpMetadata)) {
            if (!value) continue;
            // Convert camelCase to kebab-case for HTTP headers
            const headerName = key.replace(/([A-Z])/g, "-$1").toLowerCase();
            c.header(headerName, value);
        }
    } else {
        // Fallback to default content type (image/jpeg for images, leave unset for videos)
        // Video content types should be preserved from origin response
        c.header("Content-Type", "image/jpeg");
    }
}

type ImageCacheEnv = {
    Bindings: CloudflareBindings;
    Variables: {
        requestId: string;
        log: Logger;
    };
};

/**
 * Store a response in R2
 * @param {string} cacheKey - The cache key
 * @param {Context} c - Hono context
 * @returns {Promise<boolean>} - Whether the caching was successful
 */
export async function cacheResponse<TEnv extends ImageCacheEnv>(
    cacheKey: string,
    c: Context<TEnv>,
): Promise<boolean> {
    try {
        // Store the image in R2 using the cache key directly
        const imageBuffer = await c.res.clone().arrayBuffer();

        // Create minimal metadata - only what's needed to serve the cached response
        const httpMetadata: R2HTTPMetadata = {
            contentType: c.res.headers.get("content-type") || "image/jpeg",
        };

        const metadata = {
            httpMetadata: removeUnset(httpMetadata),
            customMetadata: {
                cachedAt: new Date().toISOString(),
            },
        };

        // Store the object with metadata
        await c.env.IMAGE_BUCKET.put(cacheKey, imageBuffer, metadata);

        return true;
    } catch (error) {
        const log = c.get("log");
        log.error("Error caching response: {error}", {
            error,
        });
        return false;
    }
}
