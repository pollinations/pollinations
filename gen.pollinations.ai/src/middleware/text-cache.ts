/**
 * Text cache middleware for gen.pollinations.ai
 * Copied from enter with Env type adapted.
 */

import { createMiddleware } from "hono/factory";
import type { Env } from "../env.ts";
import {
    createCaptureStream,
    generateCacheKey,
    getCachedResponse,
} from "../utils/text-cache.ts";

export const textCache = createMiddleware<Env>(async (c, next) => {
    let bodyText: string | undefined;
    if (c.req.method === "POST" || c.req.method === "PUT") {
        try {
            bodyText = await c.req.raw.clone().text();
            if (!bodyText) return next();
            try {
                const bodyObj = JSON.parse(bodyText);
                if (bodyObj.seed === -1) return next();
            } catch {
                // Not JSON, continue
            }
        } catch {
            return next();
        }
    }

    const seedParam = new URL(c.req.url).searchParams.get("seed");
    if (seedParam === "-1") return next();

    const cacheKey = await generateCacheKey(c.req.raw, bodyText);

    try {
        const cachedResponse = await getCachedResponse(c, cacheKey);
        if (cachedResponse) return cachedResponse;
        c.header("X-Cache", "MISS");
    } catch {
        // Cache read failure is non-fatal
    }

    await next();

    if (!c.res?.ok) return;
    const originalBody = c.res.body;
    if (!originalBody) return;

    const captureStream = createCaptureStream(c, cacheKey, c.res);
    const transformedBody = originalBody.pipeThrough(captureStream);

    c.res = new Response(transformedBody, {
        status: c.res.status,
        statusText: c.res.statusText,
        headers: c.res.headers,
    });

    c.res.headers.set("X-Cache", "MISS");
    c.res.headers.set("X-Cache-Key", cacheKey.substring(0, 16));
    c.res.headers.set("Cache-Control", "public, max-age=31536000, immutable");
});
