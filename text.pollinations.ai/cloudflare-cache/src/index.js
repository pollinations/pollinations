// No imports needed for Web Crypto API
import { sendToAnalytics } from "./analytics.js";
import { checkTurnstile } from "../../../shared/turnstile.js";

// Worker version to track which deployment is running
const WORKER_VERSION = "2.0.0-simplified";

// Analytics event constants - harmonized with image endpoint for GA4 consistency
const EVENTS = {
    REQUEST: "textRequested",
    SERVED_FROM_CACHE: "textServedFromCache",
    GENERATED: "textGenerated",
    FAILED: "textGenerationFailed",
};

// Cache status constants
const CACHE_STATUS = {
    HIT: "hit",
    MISS: "miss",
    PENDING: "pending",
};

// Unified logging function with category support
function log(category, message, ...args) {
    const prefix = category ? `[${category}]` : "";
    console.log(`[${WORKER_VERSION}]${prefix} ${message}`, ...args);
}

/**
 * Helper function to send analytics with cleaner syntax, matching image endpoint pattern
 * @param {Request} request - The original request
 * @param {string} eventName - The event name from EVENTS constants
 * @param {string} cacheStatus - The cache status from CACHE_STATUS constants
 * @param {Object} params - Additional analytics parameters
 * @param {Object} env - Environment variables
 * @param {ExecutionContext} ctx - The execution context
 */
function sendTextAnalytics(request, eventName, cacheStatus, params, env, ctx) {
    // Simple logging
    console.log(
        `[ANALYTICS] Sending event ${eventName} with cacheStatus=${cacheStatus}`,
    );

    // Create a single params object with all necessary data
    const analyticsData = {
        ...params,
        cacheStatus,
    };

    // Send the analytics using the proper GA4 integration
    ctx.waitUntil(sendToAnalytics(request, eventName, analyticsData, env));
}

const NON_CACHE_PATHS = ["/models", "/feed", "/openai/models"];

/**
 * Prepare metadata for caching
 */
function prepareMetadata(
    request,
    url,
    response,
    contentSize,
    isStreaming,
    hasRequestBody = false,
) {
    // Create metadata object with core response properties
    const metadata = {
        // Original URL information
        originalUrl: url.toString(),
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

        // Store only essential response headers (not all headers as JSON)
        response_server: response.headers.get("server") || "",
        response_date: response.headers.get("date") || "",
    };

    // Track metadata sizes for debugging
    const metadataSizes = {};
    let totalSize = 0;

    // Calculate sizes for core metadata
    for (const [key, value] of Object.entries(metadata)) {
        const size = new TextEncoder().encode(key + value).length;
        metadataSizes[key] = size;
        totalSize += size;
    }

    // Add only truly essential request headers to metadata
    const essentialHeaders = [
        "user-agent", // For analytics
        "referer", // For analytics
        "cf-connecting-ip", // For IP tracking
    ];

    const requestHeaderSizes = {};
    for (const [key, value] of request.headers.entries()) {
        // Skip cookie header (biggest space consumer)
        if (key.toLowerCase() === "cookie") {
            log(
                "cache",
                `  ⏭️ Skipping cookie header (${new TextEncoder().encode(key + value).length} bytes)`,
            );
            continue;
        }

        // Only include truly essential headers with size limits
        if (essentialHeaders.includes(key.toLowerCase())) {
            // Truncate very long header values to prevent metadata bloat
            const maxHeaderLength = 200; // Reasonable limit for headers
            const truncatedValue =
                value.length > maxHeaderLength
                    ? value.substring(0, maxHeaderLength) + "..."
                    : value;

            metadata[key] = truncatedValue;
            const size = new TextEncoder().encode(key + truncatedValue).length;
            requestHeaderSizes[key] = size;
            metadataSizes[`header_${key}`] = size;
            totalSize += size;
        }
    }

    // Add only essential Cloudflare data (not all 30 properties)
    const cfSizes = {};
    if (request.cf && typeof request.cf === "object") {
        // Only store essential CF properties for analytics
        const essentialCfProps = [
            "country",
            "colo",
            "httpProtocol",
            "asn",
            "continent",
        ];

        for (const prop of essentialCfProps) {
            if (request.cf[prop] !== null && request.cf[prop] !== undefined) {
                const stringValue = String(request.cf[prop]);
                metadata[prop] = stringValue;
                const size = new TextEncoder().encode(
                    prop + stringValue,
                ).length;
                cfSizes[prop] = size;
                metadataSizes[`cf_${prop}`] = size;
                totalSize += size;
            }
        }
    }

    // Log detailed size information
    log("cache", `📊 Metadata size analysis (total: ${totalSize} bytes):`);

    // Log core metadata sizes
    const coreSize = Object.entries(metadataSizes)
        .filter(([key]) => !key.startsWith("header_") && !key.startsWith("cf_"))
        .reduce((sum, [, size]) => sum + size, 0);
    log("cache", `  Core metadata: ${coreSize} bytes`);

    // Log request headers sizes (top 10 largest)
    const headerEntries = Object.entries(requestHeaderSizes)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10);
    const headerTotalSize = Object.values(requestHeaderSizes).reduce(
        (sum, size) => sum + size,
        0,
    );
    log(
        "cache",
        `  Request headers: ${headerTotalSize} bytes (${Object.keys(requestHeaderSizes).length} headers)`,
    );
    headerEntries.forEach(([key, size]) => {
        log("cache", `    ${key}: ${size} bytes`);
    });

    // Log Cloudflare data sizes (top 10 largest)
    if (Object.keys(cfSizes).length > 0) {
        const cfEntries = Object.entries(cfSizes)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10);
        const cfTotalSize = Object.values(cfSizes).reduce(
            (sum, size) => sum + size,
            0,
        );
        log(
            "cache",
            `  Cloudflare data: ${cfTotalSize} bytes (${Object.keys(cfSizes).length} properties)`,
        );
        cfEntries.forEach(([key, size]) => {
            log("cache", `    ${key}: ${size} bytes`);
        });
    }

    // Log warning if approaching or exceeding typical limits
    if (totalSize > 8000) {
        log(
            "cache",
            `⚠️  Metadata size (${totalSize} bytes) is approaching Cloudflare's limit!`,
        );
    }
    if (totalSize > 10000) {
        log(
            "cache",
            `🚨 Metadata size (${totalSize} bytes) likely exceeds Cloudflare's limit!`,
        );
    }

    return metadata;
}

/**
 * Store request body separately if it exists
 * This follows the thin proxy design principle by keeping the implementation simple
 */
async function storeRequestBody(env, request, key) {
    // Only process POST/PUT requests that might have a body
    if (
        (request.method !== "POST" && request.method !== "PUT") ||
        !request.body
    ) {
        return false;
    }

    try {
        const clonedRequest = request.clone();
        const bodyText = await clonedRequest.text();

        // Only store if there's actual content
        if (!bodyText || bodyText.length === 0) {
            return false;
        }

        // Use a predictable key pattern
        const requestKey = `${key}-request`;

        // Store the request body as-is
        await env.TEXT_BUCKET.put(requestKey, bodyText);
        log(
            "cache",
            `Stored request body separately (${bodyText.length} bytes) with key: ${requestKey}`,
        );
        return true;
    } catch (err) {
        log("error", `Failed to cache request body: ${err.message}`);
        return false;
    }
}

/**
 * Main worker entry point
 */
export default {
    async fetch(request, env, ctx) {
        try {
            const url = new URL(request.url);

            // Log request information
            log("request", `🚀 ${request.method} ${url.pathname}`);

            // Check Turnstile verification for Hacktoberfest apps
            const turnstileResponse = await checkTurnstile(request, env);
            if (turnstileResponse) {
                return turnstileResponse; // Return 403 if verification failed
            }

            // Let origin handle GET root requests (e.g. redirects) without caching
            // But allow POST requests to root to be cached
            if (
                (url.pathname === "/" || url.pathname === "") &&
                request.method === "GET"
            ) {
                log(
                    "request",
                    "Proxying GET root request directly to origin without caching",
                );
                return await proxyRequest(request, env);
            }

            // Common analytics parameters
            const analyticsParams = {
                method: request.method,
                pathname: url.pathname,
                userAgent: request.headers.get("user-agent") || "",
                referer: request.headers.get("referer") || "",
            };

            // Send text requested analytics event
            sendTextAnalytics(
                request,
                EVENTS.REQUEST,
                CACHE_STATUS.PENDING,
                analyticsParams,
                env,
                ctx,
            );

            // Check if the path should be excluded from caching (exact match only)
            if (NON_CACHE_PATHS.includes(url.pathname)) {
                log(
                    "request",
                    `Path ${url.pathname} excluded from caching, proxying directly`,
                );
                return await proxyRequest(request, env);
            }

            // Generate a cache key for the request
            const key = await generateCacheKey(request);
            log("cache", `Key: ${key}`);

            // Try to get the cached response
            const cachedResponse = await getCachedResponse(env, key);

            if (cachedResponse) {
                log("cache", "✅ Cache hit!");

                // Send analytics for cache hit (non-blocking)
                sendTextAnalytics(
                    request,
                    EVENTS.SERVED_FROM_CACHE,
                    CACHE_STATUS.HIT,
                    {
                        method: request.method,
                        pathname: new URL(request.url).pathname,
                        userAgent: request.headers.get("user-agent") || "",
                        referer: request.headers.get("referer") || "",
                    },
                    env,
                    ctx,
                );

                // For HEAD requests, return headers only (no body)
                if (request.method === "HEAD") {
                    const response = new Response(null, {
                        status: cachedResponse.status,
                        statusText: cachedResponse.statusText,
                        headers: cachedResponse.headers,
                    });
                    return response;
                }

                return cachedResponse;
            }

            log("cache", "Cache miss, proxying to origin...");
            // Store the request body if present (for POST/PUT requests)
            const hasRequestBody = await storeRequestBody(env, request, key);

            // Forward the request to the origin server
            const originResp = await proxyRequest(request, env);

            // Don't cache error responses
            if (originResp.status >= 401) {
                log(
                    "cache",
                    `Not caching error response with status ${originResp.status}`,
                );

                // Send analytics for failed request
                sendTextAnalytics(
                    request,
                    EVENTS.FAILED,
                    CACHE_STATUS.MISS,
                    {
                        ...analyticsParams,
                        error: `HTTP ${originResp.status}: ${originResp.statusText}`,
                        statusCode: originResp.status,
                    },
                    env,
                    ctx,
                );

                return originResp;
            }

            // Determine if this is a streaming response
            const contentLength = originResp.headers.get("content-length");
            const isStreaming =
                !contentLength || parseInt(contentLength) > 10 * 1024 * 1024; // 10MB threshold

            log(
                "cache",
                `Response type: ${isStreaming ? "streaming" : "regular"} (content-length: ${contentLength || "not set"})`,
            );

            // Handle regular (non-streaming) responses
            if (!isStreaming) {
                try {
                    const responseClone = originResp.clone();
                    const content = await responseClone.arrayBuffer();

                    // Prepare metadata with request body reference
                    const metadata = prepareMetadata(
                        request,
                        url,
                        originResp,
                        content.byteLength,
                        false,
                        hasRequestBody,
                    );

                    // Store the response in R2 with metadata
                    await env.TEXT_BUCKET.put(key, content, {
                        customMetadata: metadata,
                    });

                    log(
                        "cache",
                        `✅ Cached response: ${key} (${content.byteLength} bytes)`,
                    );

                    // Send analytics for cache miss but successful generation
                    sendTextAnalytics(
                        request,
                        EVENTS.GENERATED,
                        CACHE_STATUS.MISS,
                        {
                            ...analyticsParams,
                            responseSize: content.byteLength,
                            isStreaming: false,
                            contentType:
                                originResp.headers.get("content-type") || "",
                        },
                        env,
                        ctx,
                    );

                    // Return the original response
                    return originResp;
                } catch (err) {
                    log(
                        "error",
                        `Error caching regular response: ${err.message}`,
                    );
                    if (err.stack) log("error", `Stack: ${err.stack}`);
                    // Return origin response even if caching fails
                    return originResp;
                }
            }

            // This approach follows the "thin proxy" design principle:
            // 1. Send response directly to the client while collecting data for caching
            // 2. Cache the data after the stream is completely processed

            // Collect chunks as they pass through to the client
            let chunks = [];
            let totalSize = 0;

            // Create a transform stream that captures chunks as they flow through
            const captureStream = new TransformStream({
                transform(chunk, controller) {
                    // Save a copy of the chunk for caching later
                    chunks.push(chunk.slice());
                    totalSize += chunk.byteLength;

                    // Pass the chunk through unchanged to the client
                    controller.enqueue(chunk);
                },
                flush(controller) {
                    // This runs when the stream is complete
                    log(
                        "stream",
                        `🏁 Response streaming complete (${chunks.length} chunks, ${totalSize} bytes)`,
                    );

                    // Cache the response in the background once streaming is done
                    ctx.waitUntil(
                        (async () => {
                            try {
                                // Combine all chunks into a single buffer
                                const completeResponse = new Uint8Array(
                                    totalSize,
                                );
                                let offset = 0;

                                for (const chunk of chunks) {
                                    completeResponse.set(chunk, offset);
                                    offset += chunk.byteLength;
                                }

                                log(
                                    "cache",
                                    `📦 Caching complete response (${totalSize} bytes)`,
                                );

                                // Prepare metadata with request body reference
                                const metadata = prepareMetadata(
                                    request,
                                    url,
                                    originResp,
                                    totalSize,
                                    true,
                                    hasRequestBody,
                                );

                                log(
                                    "cache",
                                    "Saving metadata with keys:",
                                    Object.keys(metadata).join(", "),
                                );

                                // Store in R2 with comprehensive metadata
                                await env.TEXT_BUCKET.put(
                                    key,
                                    completeResponse,
                                    {
                                        customMetadata: metadata,
                                    },
                                );

                                log(
                                    "cache",
                                    `✅ Response cached successfully (${totalSize} bytes)`,
                                );

                                // Send analytics for successful streaming response
                                sendTextAnalytics(
                                    request,
                                    EVENTS.GENERATED,
                                    CACHE_STATUS.MISS,
                                    {
                                        ...analyticsParams,
                                        responseSize: totalSize,
                                        isStreaming: true,
                                        contentType:
                                            originResp.headers.get(
                                                "content-type",
                                            ) || "",
                                    },
                                    env,
                                    ctx,
                                );

                                // Free memory
                                chunks = null;
                            } catch (err) {
                                log(
                                    "error",
                                    `❌ Caching failed: ${err.message}`,
                                );
                                if (err.stack)
                                    log("error", `Stack: ${err.stack}`);
                            }
                        })(),
                    );
                },
            });

            // Handle HEAD requests (no body) vs other requests
            if (request.method === "HEAD" || !originResp.body) {
                // HEAD requests have no body, but we should still cache the headers
                log("cache", "📝 Caching HEAD request response (headers only)");

                // Cache the response metadata without body
                try {
                    const metadata = prepareMetadata(
                        request,
                        url,
                        originResp,
                        0, // No content size for HEAD
                        false, // Not streaming
                        hasRequestBody,
                    );

                    // Store empty body with metadata for HEAD requests
                    ctx.waitUntil(
                        env.TEXT_BUCKET.put(key, new ArrayBuffer(0), {
                            customMetadata: metadata,
                        }),
                    );

                    log("cache", "✅ HEAD response cached successfully");
                } catch (err) {
                    log("error", `❌ HEAD caching failed: ${err.message}`);
                }

                return new Response(null, {
                    status: originResp.status,
                    statusText: originResp.statusText,
                    headers: prepareResponseHeaders(originResp.headers, {
                        cacheStatus: "MISS",
                        cacheKey: key,
                    }),
                });
            }

            // Pipe the response through our capture stream for requests with body
            const transformedStream =
                originResp.body.pipeThrough(captureStream);

            // Return the stream to the client immediately
            return new Response(transformedStream, {
                status: originResp.status,
                statusText: originResp.statusText,
                headers: prepareResponseHeaders(originResp.headers, {
                    cacheStatus: "MISS",
                    cacheKey: key,
                }),
            });
        } catch (err) {
            log("error", `❌ Worker error: ${err.message}`);
            if (err.stack) log("error", `Stack: ${err.stack}`);

            return new Response(`Worker error: ${err.message}`, {
                status: 500,
                headers: {
                    "Content-Type": "text/plain",
                    "X-Error": err.message,
                },
            });
        }
    },
};

/**
 * Proxy the request to the origin server
 */
async function proxyRequest(request, env) {
    const url = new URL(request.url);

    // Construct origin URL
    let originHost = env.ORIGIN_HOST;
    if (
        !originHost.startsWith("http://") &&
        !originHost.startsWith("https://")
    ) {
        originHost = `https://${originHost}`;
    }

    const originUrl = new URL(url.pathname + url.search, originHost);
    log("proxy", `Proxying to: ${originUrl.toString()}`);

    // Prepare forwarded headers
    const headers = prepareForwardedHeaders(request.headers, url);

    log("headers", "Request headers:", Object.fromEntries(headers));

    // Create origin request
    const originRequest = new Request(originUrl.toString(), {
        method: request.method,
        headers: headers,
        body: request.body,
        redirect: "manual",
    });

    // Send the request to the origin
    return await fetch(originRequest);
}

/**
 * Generate a cache key for the request
 */
async function generateCacheKey(request) {
    // Authentication parameters to exclude from cache key
    const AUTH_PARAMS = ["token", "referrer", "referer", "nofeed", "no-cache"];

    const url = new URL(request.url);

    // Filter query parameters, excluding auth params
    const filteredParams = new URLSearchParams();
    for (const [key, value] of url.searchParams) {
        if (!AUTH_PARAMS.includes(key.toLowerCase())) {
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
    if (
        (request.method === "POST" || request.method === "PUT") &&
        request.body
    ) {
        try {
            const clonedRequest = request.clone();
            const bodyText = await clonedRequest.text();

            if (bodyText) {
                try {
                    // Try to parse as JSON and filter auth fields
                    const bodyObj = JSON.parse(bodyText);
                    const filteredBody = Object.entries(bodyObj)
                        .filter(
                            ([key]) => !AUTH_PARAMS.includes(key.toLowerCase()),
                        )
                        .reduce(
                            (acc, [key, value]) => ({ ...acc, [key]: value }),
                            {},
                        );

                    parts.push(JSON.stringify(filteredBody));
                } catch {
                    // If not JSON, use body as-is (but this shouldn't happen for our API)
                    parts.push(bodyText);
                }
            }
        } catch (err) {
            log("error", `Error processing body for cache key: ${err.message}`);
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
 * Prepare response headers by cleaning problematic ones and adding cache info
 */
function prepareResponseHeaders(originalHeaders, cacheInfo = {}) {
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
            "Content-Type, X-Turnstile-Token",
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

/**
 * Prepare forwarded headers for proxying the request
 */
function prepareForwardedHeaders(requestHeaders, url) {
    const headers = new Headers(requestHeaders);

    // Add standard forwarded headers (but NOT X-Forwarded-Host to avoid referrer confusion)
    headers.set("X-Forwarded-Proto", url.protocol.replace(":", ""));

    // Forward client IP address
    const clientIp =
        requestHeaders.get("cf-connecting-ip") ||
        requestHeaders.get("x-forwarded-for") ||
        "0.0.0.0";
    headers.set("X-Forwarded-For", clientIp);
    headers.set("X-Real-IP", clientIp);
    headers.set("CF-Connecting-IP", clientIp);

    return headers;
}

/**
 * Get a cached response from R2
 */
async function getCachedResponse(env, key) {
    try {
        // Get the cached object from R2
        const cachedObject = await env.TEXT_BUCKET.get(key);

        if (!cachedObject) {
            return null;
        }

        log("cache", "Found cached object:", {
            key,
            size: cachedObject.size,
            uploaded: cachedObject.uploaded,
            metadata: cachedObject.customMetadata,
            hasRequestBody:
                cachedObject.customMetadata?.hasRequestBody === "true",
        });

        const metadata = cachedObject.customMetadata || {};

        // Optionally log if there's an associated request body
        if (metadata.hasRequestBody === "true") {
            log(
                "cache",
                `Associated request body available at: ${key}-request`,
            );
        }

        // Prepare headers based on metadata
        const cacheHeaders = {
            cacheStatus: "HIT",
            cacheKey: key,
            cacheDate:
                metadata.timestamp || cachedObject.uploaded.toISOString(),
        };

        // Create response headers with original headers and cache info
        let originalHeaders = {};
        if (metadata.headers) {
            try {
                originalHeaders = JSON.parse(metadata.headers);
            } catch (err) {
                log(
                    "error",
                    `Error parsing headers from cache: ${err.message}`,
                );
            }
        }

        // If content-type is in metadata, ensure it's used (with backward compatibility)
        if (
            metadata.response_content_type &&
            !originalHeaders["content-type"]
        ) {
            originalHeaders["content-type"] = metadata.response_content_type;
        } else if (metadata.contentType && !originalHeaders["content-type"]) {
            // Fallback for old cache entries
            originalHeaders["content-type"] = metadata.contentType;
        }

        // Prepare the response headers
        const responseHeaders = prepareResponseHeaders(
            new Headers(originalHeaders),
            cacheHeaders,
        );

        // Create response from cached object
        const response = new Response(cachedObject.body, {
            status: parseInt(metadata.status || "200", 10),
            statusText: metadata.statusText || "OK",
            headers: responseHeaders,
        });

        return response;
    } catch (err) {
        log("error", `Error getting cached response: ${err.message}`);
        if (err.stack) log("error", `Stack: ${err.stack}`);
        return null;
    }
}

/**
 * Get a cached request body from R2
 */
async function getCachedRequest(env, key) {
    try {
        const requestKey = `${key}-request`;
        const cachedRequest = await env.TEXT_BUCKET.get(requestKey);

        if (!cachedRequest) {
            log("cache", `No cached request found for key: ${requestKey}`);
            return null;
        }

        const requestBody = await cachedRequest.text();
        log(
            "cache",
            `Retrieved cached request body: ${requestKey} (${requestBody.length} bytes)`,
        );

        return {
            body: requestBody,
            uploaded: cachedRequest.uploaded,
            size: cachedRequest.size,
        };
    } catch (err) {
        log("error", `Error getting cached request: ${err.message}`);
        return null;
    }
}

/**
 * Get both cached request and response as a pair
 */
async function getCachedRequestResponsePair(env, key) {
    try {
        // Get both in parallel for efficiency
        const [response, request] = await Promise.all([
            getCachedResponse(env, key),
            getCachedRequest(env, key),
        ]);

        return {
            request,
            response,
            key,
        };
    } catch (err) {
        log("error", `Error getting cached pair: ${err.message}`);
        return null;
    }
}

/**
 * List all cached request-response pairs (for debugging/analytics)
 * Note: This is a simple implementation - for production, consider pagination
 */
async function listCachedPairs(env, limit = 100) {
    try {
        const list = await env.TEXT_BUCKET.list({ limit });

        // Group by base key (without -request suffix)
        const pairs = new Map();

        for (const object of list.objects) {
            const key = object.key;
            const baseKey = key.endsWith("-request") ? key.slice(0, -8) : key;

            if (!pairs.has(baseKey)) {
                pairs.set(baseKey, { response: null, request: null });
            }

            if (key.endsWith("-request")) {
                pairs.get(baseKey).request = {
                    key,
                    size: object.size,
                    uploaded: object.uploaded,
                };
            } else {
                pairs.get(baseKey).response = {
                    key,
                    size: object.size,
                    uploaded: object.uploaded,
                    metadata: object.customMetadata,
                };
            }
        }

        return Array.from(pairs.entries()).map(([baseKey, pair]) => ({
            key: baseKey,
            ...pair,
        }));
    } catch (err) {
        log("error", `Error listing cached pairs: ${err.message}`);
        return [];
    }
}
