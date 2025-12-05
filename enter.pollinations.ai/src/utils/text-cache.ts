/**
 * Text caching utilities for enter.pollinations.ai
 * Adapted from text.pollinations.ai/cloudflare-cache
 * Following the "thin proxy" design principle - keeping logic simple and minimal
 */

import type { Context } from "hono";
import type { Logger } from "@logtape/logtape";

// Parameters to exclude from cache key (auth + cache control)
const EXCLUDED_PARAMS = ["key", "no-cache"];

/**
 * Generate a cache key for the request using SHA-256 hash
 * Handles both GET and POST requests
 * @param request - The request object
 * @param bodyText - Optional pre-read body text for POST requests
 * @returns Promise<string> - The cache key (SHA-256 hash)
 */
export async function generateCacheKey(
    request: Request,
    bodyText?: string,
): Promise<string> {
    const url = new URL(request.url);

    // Filter query parameters, excluding auth params
    const filteredParams = new URLSearchParams();
    for (const [key, value] of url.searchParams) {
        if (!EXCLUDED_PARAMS.includes(key.toLowerCase())) {
            filteredParams.append(key, value);
        }
    }

    // Normalize HEAD requests to GET for cache key generation
    // since HEAD should return the same headers as GET
    const normalizedMethod = request.method === "HEAD" ? "GET" : request.method;

    const parts = [
        normalizedMethod,
        url.pathname,
        filteredParams.toString(), // Only include non-auth query params
    ];

    // Add filtered body for POST/PUT requests
    if (bodyText && (request.method === "POST" || request.method === "PUT")) {
        try {
            // Try to parse as JSON and filter auth fields
            const bodyObj = JSON.parse(bodyText);
            const filteredBody: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(bodyObj)) {
                if (!EXCLUDED_PARAMS.includes(key.toLowerCase())) {
                    filteredBody[key] = value;
                }
            }
            parts.push(JSON.stringify(filteredBody));
        } catch {
            // If not JSON, use body as-is
            parts.push(bodyText);
        }
    }

    // Generate a hash of all parts using Web Crypto API
    const text = parts.join("|");
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);

    // Convert hash to hex string
    return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

/**
 * Prepare metadata for caching
 * Keeps metadata minimal to stay within R2 limits
 */
export function prepareMetadata(
    request: Request,
    url: URL,
    response: Response,
    contentSize: number,
    isStreaming: boolean,
    hasRequestBody: boolean = false,
): Record<string, string> {
    const metadata: Record<string, string> = {
        // Original URL information (truncated to leave room for other metadata)
        originalUrl: url.toString().substring(0, 512),
        cachedAt: new Date().toISOString(),
        isStreaming: isStreaming.toString(),
        responseSize: contentSize.toString(),

        // Response metadata
        response_content_type: response.headers.get("content-type") || "",
        response_cache_control: response.headers.get("cache-control") || "",
        method: request.method,
        status: response.status.toString(),
        statusText: response.statusText,

        // Request body reference
        hasRequestBody: hasRequestBody.toString(),

        // Essential response headers
        response_server: response.headers.get("server") || "",
        response_date: response.headers.get("date") || "",
    };

    // Add only essential request headers with size limits
    const essentialHeaders = ["user-agent", "referer", "cf-connecting-ip"];
    for (const headerName of essentialHeaders) {
        const value = request.headers.get(headerName);
        if (value) {
            // Truncate to prevent metadata bloat
            metadata[headerName] = value.substring(0, 200);
        }
    }

    // Add essential Cloudflare data
    const cf = (request as Request & { cf?: Record<string, unknown> }).cf;
    if (cf && typeof cf === "object") {
        const essentialCfProps = [
            "country",
            "colo",
            "httpProtocol",
            "asn",
            "continent",
        ];
        for (const prop of essentialCfProps) {
            if (cf[prop] !== null && cf[prop] !== undefined) {
                metadata[prop] = String(cf[prop]);
            }
        }
    }

    return metadata;
}

/**
 * Prepare response headers by cleaning problematic ones and adding cache info
 */
export function prepareResponseHeaders(
    originalHeaders: Headers,
    cacheInfo: {
        cacheStatus?: string;
        cacheKey?: string;
        cacheDate?: string;
    } = {},
): Headers {
    const headers = new Headers(originalHeaders);

    // Remove problematic headers
    const headersToRemove = [
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailer",
        "transfer-encoding",
        "upgrade",
    ];

    for (const header of headersToRemove) {
        headers.delete(header);
    }

    // Add CORS headers if not already present
    if (!headers.has("Access-Control-Allow-Origin")) {
        headers.set("Access-Control-Allow-Origin", "*");
    }
    if (!headers.has("Access-Control-Allow-Methods")) {
        headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    }
    if (!headers.has("Access-Control-Allow-Headers")) {
        headers.set(
            "Access-Control-Allow-Headers",
            "Content-Type, Authorization",
        );
    }

    // Add cache-related headers if provided
    if (cacheInfo.cacheStatus) {
        headers.set("X-Cache", cacheInfo.cacheStatus);
    }
    if (cacheInfo.cacheKey) {
        headers.set("X-Cache-Key", cacheInfo.cacheKey);
    }
    if (cacheInfo.cacheDate) {
        headers.set("X-Cache-Date", cacheInfo.cacheDate);
    }

    return headers;
}

type TextCacheEnv = {
    Bindings: CloudflareBindings;
    Variables: {
        requestId: string;
        log: Logger;
    };
};

/**
 * Store request body separately if it exists
 * This follows the thin proxy design principle by keeping the implementation simple
 */
export async function storeRequestBody<TEnv extends TextCacheEnv>(
    c: Context<TEnv>,
    key: string,
    bodyText: string,
): Promise<boolean> {
    if (!bodyText || bodyText.length === 0) {
        return false;
    }

    try {
        const requestKey = `${key}-request`;
        await c.env.TEXT_BUCKET.put(requestKey, bodyText);
        c.get("log")?.debug(
            "[TEXT-CACHE] Stored request body ({size} bytes) with key: {key}",
            {
                size: bodyText.length,
                key: requestKey,
            },
        );
        return true;
    } catch (error) {
        c.get("log")?.error(
            "[TEXT-CACHE] Failed to cache request body: {error}",
            { error },
        );
        return false;
    }
}

/**
 * Cache a non-streaming response in R2
 */
export async function cacheNonStreamingResponse<TEnv extends TextCacheEnv>(
    c: Context<TEnv>,
    cacheKey: string,
    content: ArrayBuffer,
    metadata: Record<string, string>,
): Promise<boolean> {
    try {
        await c.env.TEXT_BUCKET.put(cacheKey, content, {
            customMetadata: metadata,
        });
        c.get("log")?.info(
            "[TEXT-CACHE] Cached response: {key} ({size} bytes)",
            {
                key: cacheKey,
                size: content.byteLength,
            },
        );
        return true;
    } catch (error) {
        c.get("log")?.error("[TEXT-CACHE] Error caching response: {error}", {
            error,
        });
        return false;
    }
}

/**
 * Get a cached response from R2
 */
export async function getCachedResponse<TEnv extends TextCacheEnv>(
    c: Context<TEnv>,
    key: string,
): Promise<Response | null> {
    try {
        const cachedObject = await c.env.TEXT_BUCKET.get(key);

        if (!cachedObject) {
            return null;
        }

        const metadata = cachedObject.customMetadata || {};

        // Prepare headers based on metadata
        const cacheHeaders = {
            cacheStatus: "HIT",
            cacheKey: key,
            cacheDate: metadata.cachedAt || cachedObject.uploaded.toISOString(),
        };

        // Build original headers from metadata
        const originalHeaders: Record<string, string> = {};
        if (metadata.response_content_type) {
            originalHeaders["content-type"] = metadata.response_content_type;
        }

        // Prepare the response headers
        const responseHeaders = prepareResponseHeaders(
            new Headers(originalHeaders),
            cacheHeaders,
        );

        // Create response from cached object
        return new Response(cachedObject.body, {
            status: parseInt(metadata.status || "200", 10),
            statusText: metadata.statusText || "OK",
            headers: responseHeaders,
        });
    } catch (error) {
        c.get("log")?.error(
            "[TEXT-CACHE] Error getting cached response: {error}",
            { error },
        );
        return null;
    }
}

/**
 * Create a transform stream that captures chunks for caching while streaming to client
 * This is the key to caching streaming responses
 */
export function createCaptureStream<TEnv extends TextCacheEnv>(
    c: Context<TEnv>,
    cacheKey: string,
    request: Request,
    url: URL,
    response: Response,
    hasRequestBody: boolean,
): TransformStream<Uint8Array, Uint8Array> {
    const log = c.get("log");
    let chunks: Uint8Array[] = [];
    let totalSize = 0;

    return new TransformStream({
        transform(chunk, controller) {
            // Save a copy of the chunk for caching later
            chunks.push(chunk.slice());
            totalSize += chunk.byteLength;

            // Pass the chunk through unchanged to the client
            controller.enqueue(chunk);
        },
        flush(_controller) {
            // This runs when the stream is complete
            log?.debug(
                "[TEXT-CACHE] Response streaming complete ({chunks} chunks, {size} bytes)",
                {
                    chunks: chunks.length,
                    size: totalSize,
                },
            );

            // Cache the response in the background once streaming is done
            c.executionCtx.waitUntil(
                (async () => {
                    try {
                        // Combine all chunks into a single buffer
                        const completeResponse = new Uint8Array(totalSize);
                        let offset = 0;

                        for (const chunk of chunks) {
                            completeResponse.set(chunk, offset);
                            offset += chunk.byteLength;
                        }

                        // Prepare metadata
                        const metadata = prepareMetadata(
                            request,
                            url,
                            response,
                            totalSize,
                            true,
                            hasRequestBody,
                        );

                        // Store in R2
                        await c.env.TEXT_BUCKET.put(
                            cacheKey,
                            completeResponse,
                            {
                                customMetadata: metadata,
                            },
                        );

                        log?.info(
                            "[TEXT-CACHE] Streaming response cached successfully ({size} bytes)",
                            {
                                size: totalSize,
                            },
                        );

                        // Free memory
                        chunks = [];
                    } catch (error) {
                        log?.error("[TEXT-CACHE] Caching failed: {error}", {
                            error,
                        });
                    }
                })(),
            );
        },
    });
}
