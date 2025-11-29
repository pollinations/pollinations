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

        // Get client information from request
        const clientIp = c.get("connectingIp");

        // Get additional client information
        const userAgent = c.req.header("user-agent") || "";
        const referer =
            c.req.header("referer") || c.req.header("referrer") || "";
        const acceptLanguage = c.req.header("accept-language") || "";
        const requestId = c.req.header("cf-ray") || ""; // Cloudflare Ray ID uniquely identifies the request

        // Get request-specific information
        const method = c.req.method || "GET";
        const requestTime = new Date().toISOString();

        // Helper function to sanitize and limit string length
        const sanitizeValue = (
            value: string | object | unknown[] | null | undefined,
            maxLength: number = 256,
            key: string | null = null,
        ) => {
            if (value === undefined || value === null) return undefined;
            if (typeof value === "string") return value.substring(0, maxLength);
            if (Array.isArray(value)) {
                return value.map((item: string | object | unknown[]) =>
                    sanitizeValue(item, maxLength),
                );
            }
            if (typeof value === "object") {
                // Special case for detectionIds - stringify it
                if (key === "detectionIds") {
                    try {
                        return JSON.stringify(value);
                    } catch (_) {
                        return undefined;
                    }
                }
                // Skip other objects
                return undefined;
            }
            return value;
        };

        // Filter CF data to exclude object values
        const filterCfData = (cf: object) => {
            if (!cf) return {};

            const filtered = {};
            for (const [key, value] of Object.entries(cf)) {
                // Skip botManagement as we'll handle it separately
                if (key === "botManagement") continue;

                // Only include non-object values or special cases
                if (typeof value !== "object" || value === null) {
                    filtered[key] = sanitizeValue(value, 256, key);
                } else if (key === "detectionIds") {
                    // Special case for detectionIds
                    try {
                        filtered[key] = JSON.stringify(value);
                    } catch (_) {
                        // Skip if can't stringify
                    }
                }
            }
            return filtered;
        };

        // Filter botManagement to exclude object values
        const filterBotManagement = (botManagement: object) => {
            if (!botManagement) return {};

            const filtered = {};
            for (const [key, value] of Object.entries(botManagement)) {
                // Only include non-object values except for detectionIds
                if (typeof value !== "object" || value === null) {
                    filtered[key] = sanitizeValue(value, 256, key);
                } else if (key === "detectionIds") {
                    // Special case for detectionIds
                    try {
                        filtered[key] = JSON.stringify(value);
                    } catch (_) {
                        // Skip if can't stringify
                    }
                }
            }
            return filtered;
        };

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
            customMetadata: removeUndefined({
                // Essential metadata
                originalUrl: (c.req.url || "").substring(0, 2048),
                cachedAt: new Date().toISOString(),
                clientIp: clientIp,

                // Client information (with length limits)
                userAgent: userAgent.substring(0, 256),
                referer: referer.substring(0, 256),
                acceptLanguage: acceptLanguage.substring(0, 64),

                // Request-specific information
                method,
                requestTime,
                requestId,

                // Cloudflare information - spread filtered cf data
                ...filterCfData(c.req.raw.cf),

                // Bot Management information if available
                ...filterBotManagement(c.req.raw.cf?.botManagement as object),
            }),
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
