import { createMiddleware } from "hono/factory";
import type { Env } from "../env.ts";

/**
 * Serialized response data that can be shared across request contexts
 * Cloudflare Workers cannot share Response objects between requests,
 * so we store the raw data and create new Response objects for each consumer
 */
type SerializedResponse = {
    body: ArrayBuffer;
    status: number;
    statusText: string;
    headers: [string, string][];
};

/**
 * In-memory map of inflight requests
 * Key: URL hash, Value: Promise<SerializedResponse>
 */
const inflightRequests = new Map<string, Promise<SerializedResponse>>();

/**
 * Request deduplication middleware
 *
 * Prevents duplicate concurrent requests by sharing response data.
 * When multiple identical requests arrive, only the first executes -
 * others wait for and share the same response data.
 *
 * How it works:
 * 1. Hash the request (method + URL + body) to create a unique key
 * 2. Check if a request for this key is already inflight
 * 3. If yes: wait for the existing promise, create new Response from data
 * 4. If no: execute the request, serialize response, store promise
 * 5. Auto-cleanup when request completes
 *
 * Key design: Uses method + URL + body (no user-specific data)
 * - GET: method + URL (with query params)
 * - POST: method + URL + request body (messages, model, etc.)
 * - Same request = same result for all users (deterministic endpoints)
 * - Maximizes deduplication efficiency
 *
 * Note: Stores serialized response data (not Response objects) because
 * Cloudflare Workers cannot share I/O objects between request contexts.
 */
export const requestDeduplication = createMiddleware<Env>(async (c, next) => {
    const log = c.get("log");

    // Deduplicate safe methods (GET, HEAD, OPTIONS, TRACE) and POST
    // Safe methods: read-only, no side effects
    // POST: deterministic for our AI generation endpoints
    // Skip: PUT, DELETE, PATCH (not safe for deduplication)
    const method = c.req.method;
    const shouldDeduplicate = [
        "GET",
        "HEAD",
        "OPTIONS",
        "TRACE",
        "POST",
    ].includes(method);

    if (!shouldDeduplicate) {
        log.debug("[DEDUP] Skipping deduplication for method: {method}", {
            method,
        });
        return await next();
    }

    // Skip deduplication for streaming requests
    // Streaming responses cannot be buffered into ArrayBuffer without breaking SSE
    if (method === "POST") {
        try {
            const clonedReq = c.req.raw.clone();
            const body = (await clonedReq.json()) as {
                stream?: boolean | string;
            };
            if (body?.stream === true || body?.stream === "true") {
                log.debug(
                    "[DEDUP] Skipping deduplication for streaming request",
                );
                return await next();
            }
        } catch {
            // If body parsing fails, continue with deduplication
        }
    }

    // Create deduplication key from URL + method + body
    const key = await createRequestKey(c);

    log.debug("[DEDUP] Deduplicating request: {method} {url}", {
        method,
        url: c.req.url,
        key: key.substring(0, 12) + "...",
    });

    // Check if request already inflight
    const existingPromise = inflightRequests.get(key);
    if (existingPromise) {
        log.debug("[DEDUP] Waiting for inflight request");
        const data = await existingPromise;
        // Create new Response from serialized data with cache header
        const headers = new Headers(data.headers);
        headers.set("X-Cache", "HIT");
        headers.set("X-Cache-Type", "DEDUP");
        return new Response(data.body, {
            status: data.status,
            statusText: data.statusText,
            headers,
        });
    }

    // Start new request
    log.debug("[DEDUP] Starting new request");

    // Create and store promise BEFORE executing
    // Serialize response data so it can be shared across request contexts
    const promise = (async (): Promise<SerializedResponse> => {
        await next();
        // Serialize the response for storage
        const response = c.res;
        const body = await response.clone().arrayBuffer();
        return {
            body,
            status: response.status,
            statusText: response.statusText,
            headers: [...response.headers.entries()],
        };
    })();

    inflightRequests.set(key, promise);

    // Cleanup after completion
    promise.finally(() => {
        inflightRequests.delete(key);
        log.debug("[DEDUP] Cleaned up request");
    });

    // Wait for serialization to complete, then return original response
    await promise;
    return c.res;
});

/**
 * Create a deduplication key from request URL, method, and body
 * Handles GET (URL only) and POST (URL + body) robustly
 */
async function createRequestKey(c: {
    req: { method: string; url: string; raw: Request };
}): Promise<string> {
    const parts: string[] = [];

    // Always include method and URL
    parts.push(c.req.method);
    parts.push(c.req.url);

    // For POST, include body if present (GET uses URL params)
    if (c.req.method === "POST") {
        try {
            // Clone the request to read body without consuming it
            const clonedReq = c.req.raw.clone();
            const body = await clonedReq.text();
            if (body) {
                parts.push(body);
            }
        } catch (error) {
            // If body reading fails, just use URL (graceful degradation)
            // This can happen with malformed requests or stream issues
            console.debug(
                "[DEDUP] Failed to read request body for key generation",
                error,
            );
        }
    }

    // Hash the combined parts
    const combined = parts.join("|");
    const encoder = new TextEncoder();
    const data = encoder.encode(combined);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

    return `req:${hashHex}`;
}
