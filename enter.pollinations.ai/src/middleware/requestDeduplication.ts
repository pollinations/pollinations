import type { Logger } from "@logtape/logtape";
import { createMiddleware } from "hono/factory";
import type { RequestDeduplicator } from "../durable-objects/RequestDeduplicator.ts";
import type { Env } from "../env.ts";

/**
 * Request deduplication middleware (Durable Object-backed)
 *
 * Prevents duplicate concurrent requests across all isolates.
 * The DO only tracks "processing" state — no response storage.
 * Concurrent duplicates wait until processing completes, then fall through
 * to the cache layer (image-cache / text-cache) which will have the response.
 */
export const requestDeduplication = createMiddleware<Env>(async (c, next) => {
    const log = c.get("log");

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

    // Skip for seed=-1 (random seed convention)
    const seedParam = new URL(c.req.url).searchParams.get("seed");
    if (seedParam === "-1") {
        log.debug("[DEDUP] seed=-1, skipping deduplication");
        return await next();
    }

    // Skip streaming and seed=-1 in POST body
    if (method === "POST") {
        try {
            const clonedReq = c.req.raw.clone();
            const body = (await clonedReq.json()) as {
                stream?: boolean;
                seed?: number;
            };
            if (body?.stream === true) {
                log.debug(
                    "[DEDUP] Skipping deduplication for streaming request",
                );
                return await next();
            }
            if (body?.seed === -1) {
                log.debug("[DEDUP] seed=-1 in body, skipping deduplication");
                return await next();
            }
        } catch {
            // If body parsing fails, continue with deduplication
        }
    }

    // Skip if DO binding not available (e.g. local dev without DO support)
    if (!c.env.REQUEST_DEDUPLICATOR) {
        log.debug("[DEDUP] No DO binding, falling through");
        return await next();
    }

    const key = await createRequestKey(c);
    const stubId = c.env.REQUEST_DEDUPLICATOR.idFromName(key);
    const stub = c.env.REQUEST_DEDUPLICATOR.get(
        stubId,
    ) as DurableObjectStub<RequestDeduplicator>;

    log.debug("[DEDUP] Checking request: {method} {url}", {
        method,
        url: c.req.url,
        key: `${key.substring(0, 12)}...`,
    });

    const result = await stub.checkRequest();

    if ("waiting" in result) {
        log.debug("[DEDUP] Waiting for inflight request to complete");
        await waitForIdle(stub, log);
        // Now fall through to next() — cache layer will serve the response
        log.debug("[DEDUP] Inflight request done, proceeding to cache layer");
    } else {
        log.debug("[DEDUP] First request, proceeding");
    }

    // Execute the request (first request hits origin, waiters hit cache)
    try {
        await next();
    } finally {
        // Only the first request (proceed=true) marks done
        if ("proceed" in result) {
            try {
                await stub.markDone();
            } catch (err) {
                log.debug("[DEDUP] Failed to mark done: {error}", {
                    error: String(err),
                });
            }
        }
    }
});

/**
 * Poll the DO until the processing request completes
 */
async function waitForIdle(
    stub: DurableObjectStub<RequestDeduplicator>,
    log: Logger,
): Promise<void> {
    const maxWait = 120_000;
    const pollInterval = 500;
    const start = Date.now();

    while (Date.now() - start < maxWait) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval));

        const result = await stub.checkRequest();
        if ("proceed" in result) {
            // Processing finished (or stale), we got ownership — release it
            // immediately since we'll just hit the cache layer
            await stub.markDone();
            return;
        }
        // Still waiting — continue polling
    }

    log.debug("[DEDUP] Poll timed out after {ms}ms", { ms: maxWait });
}

/**
 * Create a deduplication key from request URL, method, and body
 */
async function createRequestKey(c: {
    req: { method: string; url: string; raw: Request };
}): Promise<string> {
    const parts: string[] = [c.req.method, c.req.url];

    if (c.req.method === "POST") {
        try {
            const clonedReq = c.req.raw.clone();
            const body = await clonedReq.text();
            if (body) {
                parts.push(body);
            }
        } catch {
            // Graceful degradation — just use URL
        }
    }

    const combined = parts.join("|");
    const data = new TextEncoder().encode(combined);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
