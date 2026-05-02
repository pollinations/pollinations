/**
 * Text caching utilities for gen.pollinations.ai
 * Adapted from gen.pollinations.ai/cloudflare-cache
 * Following the "thin proxy" design principle - keeping logic simple and minimal
 */

import type { Logger } from "@logtape/logtape";
import {
    parseSafeFeatures,
    SAFETY_HEADER_NAME,
} from "@shared/schemas/safety.ts";
import stableStringify from "fast-json-stable-stringify";
import type { Context } from "hono";

// Parameters to exclude from cache key (auth + cache control)
const EXCLUDED_PARAMS = ["key", "no-cache"];
const CACHED_HEADER_NAMES = new Set(["x-model-used"]);
const CACHED_HEADER_PREFIXES = ["x-usage-", "x-moderation-", "x-safety-"];
const SAFETY_CACHE_VERSION = "bedrock-input-v1";

function hasActiveSafety(value: unknown): boolean {
    return (
        parseSafeFeatures(value as string | boolean | undefined | null).size > 0
    );
}

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

    // Filter query parameters, excluding auth params, and sort by key so
    // equivalent URLs reuse the same cache entry regardless of parameter order.
    const filteredParams = new URLSearchParams();
    const queryParams = Array.from(url.searchParams.entries())
        .filter(([key]) => !EXCLUDED_PARAMS.includes(key.toLowerCase()))
        .sort(([keyA], [keyB]) => keyA.localeCompare(keyB));
    for (const [key, value] of queryParams) {
        filteredParams.append(key, value);
    }

    // Normalize HEAD requests to GET for cache key generation
    // since HEAD should return the same headers as GET
    const normalizedMethod = request.method === "HEAD" ? "GET" : request.method;

    const parts = [
        normalizedMethod,
        url.pathname,
        filteredParams.toString(), // Only include non-auth query params
    ];
    const hasQuerySafe = url.searchParams.has("safe");
    let hasBodySafe = false;
    let usesSafety = hasActiveSafety(url.searchParams.get("safe"));

    // Add filtered body for POST/PUT requests
    if (bodyText && (request.method === "POST" || request.method === "PUT")) {
        try {
            // Try to parse as JSON and filter auth fields
            const bodyObj = JSON.parse(bodyText);
            hasBodySafe = Object.hasOwn(bodyObj, "safe");
            usesSafety ||= hasActiveSafety(bodyObj.safe);
            const filteredBody: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(bodyObj)) {
                if (!EXCLUDED_PARAMS.includes(key.toLowerCase())) {
                    filteredBody[key] = value;
                }
            }
            // Cache is keyed by the user's original input plus safe mode. On a
            // MISS, safety may redact before generation, but keeping the
            // original input in the key prevents unrelated prompts from sharing.
            parts.push(stableStringify(filteredBody));
        } catch {
            // If not JSON, use body as-is
            parts.push(bodyText);
        }
    }
    const safeHeader = request.headers.get(SAFETY_HEADER_NAME);
    if (safeHeader !== null && !hasQuerySafe && !hasBodySafe) {
        parts.push(`${SAFETY_HEADER_NAME}:${safeHeader}`);
        usesSafety ||= hasActiveSafety(safeHeader);
    }
    if (usesSafety) {
        parts.push(SAFETY_CACHE_VERSION);
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
 * Minimal metadata - only what's needed to serve the cached response
 */
export function prepareMetadata(response: Response): Record<string, string> {
    const metadata: Record<string, string> = {
        response_content_type: response.headers.get("content-type") || "",
        status: response.status.toString(),
        statusText: response.statusText,
        cachedAt: new Date().toISOString(),
    };
    for (const [name, value] of response.headers.entries()) {
        const lowerName = name.toLowerCase();
        if (
            CACHED_HEADER_NAMES.has(lowerName) ||
            CACHED_HEADER_PREFIXES.some((prefix) =>
                lowerName.startsWith(prefix),
            )
        ) {
            metadata[`header_${lowerName}`] = value;
        }
    }
    return metadata;
}

type TextCacheEnv = {
    Bindings: CloudflareBindings;
    Variables: {
        requestId: string;
        log: Logger;
    };
};

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

        // Build headers from metadata
        const headers = new Headers();
        if (metadata.response_content_type) {
            headers.set("content-type", metadata.response_content_type);
        }
        for (const [key, value] of Object.entries(metadata)) {
            if (key.startsWith("header_")) {
                headers.set(key.slice("header_".length), value);
            }
        }

        // Add cache headers
        headers.set("X-Cache", "HIT");
        headers.set("X-Cache-Key", key.substring(0, 16));
        headers.set(
            "X-Cache-Date",
            metadata.cachedAt || cachedObject.uploaded.toISOString(),
        );
        // Browser cache: immutable since same request = same response
        headers.set("Cache-Control", "public, max-age=31536000, immutable");

        // Create response from cached object
        return new Response(cachedObject.body, {
            status: parseInt(metadata.status || "200", 10),
            statusText: metadata.statusText || "OK",
            headers,
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
 * Create a transform stream that captures chunks for caching
 * Works for both streaming (SSE) and non-streaming (JSON) responses
 * Non-streaming responses just come through as one or a few chunks
 */
export function createCaptureStream<TEnv extends TextCacheEnv>(
    c: Context<TEnv>,
    cacheKey: string,
    response: Response,
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
                        const metadata = prepareMetadata(response);

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
