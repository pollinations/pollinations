// No imports needed for Web Crypto API
import { checkTurnstile } from "../../../shared/turnstile.js";
import { origin } from "./origin.js";

// Durable Object classes must be exported by the Worker's main module
export { IpSlot } from "../../../shared/ip-slot.js";

// Worker version to track which deployment is running
const WORKER_VERSION = "2.0.0-simplified";

// Unified logging function with category support
function log(category, message, ...args) {
    const prefix = category ? `[${category}]` : "";
    console.log(`[${WORKER_VERSION}]${prefix} ${message}`, ...args);
}

const NON_CACHE_PATHS = ["/models", "/feed", "/openai/models"];

/**
 * Prepare metadata for caching
 */
function prepareMetadata(request, response, contentSize, isStreaming) {
    // Create metadata object with core response properties
    const metadata = {
        cachedAt: new Date().toISOString(),
        isStreaming: isStreaming.toString(),
        responseSize: contentSize.toString(),

        // Response metadata
        response_content_type: response.headers.get("content-type") || "",
        response_cache_control: response.headers.get("cache-control") || "",
        method: request.method,
        status: response.status.toString(),
        statusText: response.statusText,

        // Store only essential response headers (not all headers as JSON)
        response_server: response.headers.get("server") || "",
        response_date: response.headers.get("date") || "",
    };

    return metadata;
}

const ATTRIBUTION_HEADERS = {
    Link: '<https://pollinations.ai>; rel="service"',
    "X-Pollinations-Logo":
        "https://raw.githubusercontent.com/pollinations/pollinations/main/packages/ui/src/brand/lockup-horizontal-black.svg",
    "X-Powered-By": "Pollinations.AI",
};

export function withAttributionHeaders(response) {
    if (!response.ok) {
        return response;
    }

    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(ATTRIBUTION_HEADERS)) {
        headers.set(name, value);
    }
    const exposedHeaders = new Set(
        (headers.get("Access-Control-Expose-Headers") || "")
            .split(",")
            .map((name) => name.trim())
            .filter(Boolean),
    );
    for (const name of Object.keys(ATTRIBUTION_HEADERS)) {
        exposedHeaders.add(name);
    }
    headers.set(
        "Access-Control-Expose-Headers",
        Array.from(exposedHeaders).join(", "),
    );

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

/**
 * Main worker entry point
 */
const worker = {
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

            // The GET root redirect (POST / is cached) and the listed paths'
            // static GET and HEAD answers come fresh from origin(), never R2
            const read = request.method === "GET" || request.method === "HEAD";
            if (
                (url.pathname === "/" && request.method === "GET") ||
                (read && NON_CACHE_PATHS.includes(url.pathname))
            ) {
                return await origin(request, env, ctx);
            }
            // Other methods there are uncached too, but can generate
            // (POST /openai/models), so they follow the split
            if (NON_CACHE_PATHS.includes(url.pathname)) {
                return await missToOrigin(request, env, ctx);
            }

            // Generate a cache key for the request
            const key = await generateCacheKey(request);
            log("cache", `Key: ${key}`);

            // Try to get the cached response
            const cachedResponse = await getCachedResponse(env, key);

            if (cachedResponse) {
                log("cache", "✅ Cache hit!");

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

            // Cached responses stay free. A paid cache miss reaches the origin,
            // but its settlement headers and body must not enter the public cache.
            if (
                request.headers.has("payment-signature") ||
                request.headers.has("x-payment")
            ) {
                return await missToOrigin(request, env, ctx);
            }

            // A HEAD response has no body. HEAD shares the GET cache key, so
            // storing it would serve an empty body to every later GET.
            if (request.method === "HEAD") {
                return await missToOrigin(request, env, ctx);
            }

            log("cache", "Cache miss, proxying to origin...");

            // Generate the response in the Worker or on the VM
            const originResp = await missToOrigin(request, env, ctx);

            // Don't cache error responses
            if (originResp.status >= 401) {
                log(
                    "cache",
                    `Not caching error response with status ${originResp.status}`,
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
                        originResp,
                        content.byteLength,
                        false,
                    );

                    // Store the response in R2 with metadata
                    await env.TEXT_BUCKET.put(key, content, {
                        customMetadata: metadata,
                    });

                    log(
                        "cache",
                        `✅ Cached response: ${key} (${content.byteLength} bytes)`,
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
                                    originResp,
                                    totalSize,
                                    true,
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

            // A response without a body has nothing to cache.
            if (!originResp.body) {
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
            return workerError(err);
        }
    },
};

/** The Worker's 500 for an exception */
function workerError(err) {
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

export default {
    async fetch(request, env, ctx) {
        return withAttributionHeaders(await worker.fetch(request, env, ctx));
    },
};

/**
 * Sends a cache miss to origin() for ADAPTER_SHARE percent of requests and to
 * the VM otherwise, and labels the response, exceptions included, with the
 * path it took.
 */
async function missToOrigin(request, env, ctx) {
    const path =
        Math.random() * 100 < Number(env.ADAPTER_SHARE ?? 0) ? "worker" : "vm";
    let response;
    try {
        response =
            path === "worker"
                ? await origin(request, env, ctx)
                : await proxyRequest(request, env);
    } catch (err) {
        response = workerError(err);
    }
    const headers = new Headers(response.headers);
    headers.set("X-Legacy-Path", path);
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

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
export async function generateCacheKey(request) {
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
            "Content-Type, X-Turnstile-Token, Payment-Signature, X-PAYMENT",
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
export function prepareForwardedHeaders(requestHeaders, url) {
    const headers = new Headers(requestHeaders);
    // No CloudFront fronts this host, and the origin's per-IP limit trusts this
    // header first, so a client-sent value would let callers pick their own IP.
    headers.delete("cloudfront-viewer-address");

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
export async function getCachedResponse(env, key) {
    try {
        // Get the cached object from R2
        const cachedObject = await env.TEXT_BUCKET.get(key);

        // HEAD misses used to store empty objects; treat them as misses so
        // the next GET replaces them with the real response.
        if (!cachedObject || cachedObject.size === 0) {
            return null;
        }

        log("cache", "Found cached object:", {
            key,
            size: cachedObject.size,
            uploaded: cachedObject.uploaded,
            metadata: cachedObject.customMetadata,
        });

        const metadata = cachedObject.customMetadata || {};

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
