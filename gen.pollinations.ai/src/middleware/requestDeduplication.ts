/**
 * Request deduplication middleware for gen.pollinations.ai
 * Copied from enter with Env type adapted.
 */

import { createMiddleware } from "hono/factory";
import type { Env } from "../env.ts";

type SerializedResponse = {
    body: ArrayBuffer;
    status: number;
    statusText: string;
    headers: [string, string][];
};

const inflightRequests = new Map<string, Promise<SerializedResponse>>();

export const requestDeduplication = createMiddleware<Env>(async (c, next) => {
    const method = c.req.method;
    const shouldDeduplicate = [
        "GET",
        "HEAD",
        "OPTIONS",
        "TRACE",
        "POST",
    ].includes(method);

    if (!shouldDeduplicate) return await next();

    // Skip for streaming requests
    if (method === "POST") {
        try {
            const clonedReq = c.req.raw.clone();
            const body = (await clonedReq.json()) as { stream?: boolean };
            if (body?.stream === true) return await next();
        } catch {
            // Continue with deduplication
        }
    }

    const key = await createRequestKey(c);

    const existingPromise = inflightRequests.get(key);
    if (existingPromise) {
        const data = await existingPromise;
        const headers = new Headers(data.headers);
        headers.set("X-Cache", "HIT");
        headers.set("X-Cache-Type", "DEDUP");
        return new Response(data.body, {
            status: data.status,
            statusText: data.statusText,
            headers,
        });
    }

    const promise = (async (): Promise<SerializedResponse> => {
        await next();
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
    promise.finally(() => inflightRequests.delete(key));

    await promise;
    return c.res;
});

async function createRequestKey(c: {
    req: { method: string; url: string; raw: Request };
}): Promise<string> {
    const parts: string[] = [c.req.method, c.req.url];

    if (c.req.method === "POST") {
        try {
            const clonedReq = c.req.raw.clone();
            const body = await clonedReq.text();
            if (body) parts.push(body);
        } catch {
            // Graceful degradation
        }
    }

    const combined = parts.join("|");
    const encoder = new TextEncoder();
    const data = encoder.encode(combined);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return `req:${hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}
