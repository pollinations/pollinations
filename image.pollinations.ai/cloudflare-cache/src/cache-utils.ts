/**
 * Utility functions for caching images in Cloudflare R2
 * Following the "thin proxy" design principle - keeping logic simple and minimal
 */

import type { Context } from "hono";
import { createSimpleHash, removeUndefined } from "./util.js";
import { createVectorizeStore } from "./vector-store.js";

type Env = {
    Bindings: Cloudflare.Env;
    Variables: {
        connectingIp: string;
        cacheKey: string;
    };
};

export const CACHE_VERSION = "brand-v1";

/**
 * Apply model-specific caching rules to the URL
 * @param {URL} url - The URL object to transform
 * @returns {URL} - The transformed URL object
 */
function applyModelSpecificRules(url: URL): URL {
    // Get the model parameter
    const model = url.searchParams.get("model");

    // Define model-specific rules that return new URL parameters
    const modelRules = {
        gptimage: (currentUrl: URL) => {
            // For gptimage, always use the same seed for consistent caching
            const newUrl = new URL(currentUrl);
            newUrl.searchParams.set("seed", "42");
            return newUrl;
        },
        // Add more model rules here as needed
        // 'somemodel': (currentUrl) => {
        //   const newUrl = new URL(currentUrl);
        //   // transformation logic
        //   return newUrl;
        // }
    };

    // Apply the rule if it exists for this model, otherwise return original
    return model && modelRules[model] ? modelRules[model](url) : url;
}

/**
 * Generate a consistent cache key from URL
 * @param {URL} url - The URL object
 * @returns {string} - The cache key
 */
export function generateCacheKey(url: URL): string {
    return generateCacheKeyWithVersion(url, CACHE_VERSION);
}

export function generateLegacyCacheKey(url: URL): string {
    return generateCacheKeyWithVersion(url);
}

function generateCacheKeyWithVersion(url: URL, version?: string): string {
    // Apply model-specific rules first
    const transformedUrl = applyModelSpecificRules(url);

    // Normalize the URL by sorting query parameters
    const normalizedUrl = new URL(transformedUrl);
    const params = Array.from(normalizedUrl.searchParams.entries()).sort(
        ([keyA], [keyB]) => keyA.localeCompare(keyB),
    );

    // Clear and re-add sorted parameters
    normalizedUrl.search = "";
    params.forEach(([key, value]) => {
        // Skip certain parameters that shouldn't affect caching
        // Authentication and referrer parameters should not be part of cache key
        if (
            !["nofeed", "no-cache", "token", "referrer", "referer"].includes(
                key,
            )
        ) {
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
    const prefix = version ? `${version}-` : "";
    const maxPathLength = 1000 - prefix.length - hash.length - 1;
    const trimmedPath = safePath.substring(0, maxPathLength);

    return `${prefix}${trimmedPath}-${hash}`;
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
 * Store a response in R2
 * @param {string} cacheKey - The cache key
 * @returns {Promise<boolean>} - Whether the caching was successful
 */
export async function cacheResponse(
    cacheKey: string,
    c: Context<Env>,
): Promise<boolean> {
    try {
        // Store the image in R2 using the cache key directly
        const imageBuffer = await c.res.clone().arrayBuffer();

        // Create metadata object with content type and original URL
        const httpMetadata: R2HTTPMetadata = {
            contentType: c.res.headers.get("content-type") || "image/jpeg",
            contentEncoding: c.res.headers.get("content-encoding"),
            contentDisposition: c.res.headers.get("content-disposition"),
            contentLanguage: c.res.headers.get("content-language"),
            cacheControl: c.res.headers.get("cache-control"),
        };

        const metadata = {
            httpMetadata: removeUndefined(httpMetadata),
            customMetadata: {
                originalUrl: (c.req.url || "").substring(0, 2048),
                cachedAt: new Date().toISOString(),
                method: c.req.method || "GET",
            },
        };

        // Store the object with metadata
        await c.env.IMAGE_BUCKET.put(cacheKey, imageBuffer, metadata);

        return true;
    } catch (error) {
        console.error("[EXACT] Error caching response:", error);
        return false;
    }
}

/**
 * Delete a cached image from R2 and Vectorize
 * @param {string} cacheKey - The cache key to delete
 * @param {Cloudflare.Env} env - The environment bindings
 * @returns {Promise<{r2Deleted: boolean, vectorDeleted: boolean}>} - Deletion results
 */
export async function deleteCacheEntry(
    cacheKey: string,
    env: Cloudflare.Env,
): Promise<{ r2Deleted: boolean; vectorDeleted: boolean }> {
    let r2Deleted = false;
    let vectorDeleted = false;

    // Delete from R2
    // Note: R2 delete() returns void and doesn't throw if key doesn't exist
    // We first check if the object exists to provide accurate feedback
    try {
        const existingObject = await env.IMAGE_BUCKET.head(cacheKey);
        if (existingObject) {
            await env.IMAGE_BUCKET.delete(cacheKey);
            console.log("[DELETE] Deleted from R2:", cacheKey);
            r2Deleted = true;
        } else {
            console.log("[DELETE] Object not found in R2:", cacheKey);
        }
    } catch (error) {
        console.error("[DELETE] Error deleting from R2:", error);
    }

    // Delete from Vectorize
    // Note: Vectorize deletes are asynchronous and may take a few seconds to propagate
    try {
        const vectorStore = createVectorizeStore(env.VECTORIZE_INDEX);
        const vectorId = await createSimpleHash(cacheKey);
        vectorDeleted = await vectorStore.deleteById(vectorId);
        if (vectorDeleted) {
            console.log("[DELETE] Deleted from Vectorize:", vectorId);
        } else {
            console.log("[DELETE] Vector not found or delete failed:", vectorId);
        }
    } catch (error) {
        console.error("[DELETE] Error deleting from Vectorize:", error);
    }

    return { r2Deleted, vectorDeleted };
}
