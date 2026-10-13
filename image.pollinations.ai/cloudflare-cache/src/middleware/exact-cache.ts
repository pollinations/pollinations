import { createMiddleware } from "hono/factory";
import { cacheResponse, generateCacheKey } from "../cache-utils.ts";
import { setHttpMetadataHeaders } from "../util.ts";

type Env = {
    Bindings: Cloudflare.Env;
    Variables: {
        connectingIp: string;
    };
};

export const exactCache = createMiddleware<Env>(async (c, next) => {
    // skip entirely if no-cache header is set
    if (c.req.header("no-cache")) return next();

    const cacheKey = generateCacheKey(new URL(c.req.url));
    console.debug("[EXACT] Cache key:", cacheKey);

    try {
        const cachedImage = await c.env.IMAGE_BUCKET.get(cacheKey);
        // HEAD misses used to store empty objects; treat them as misses so
        // the next GET replaces them with the real image.
        if (cachedImage && cachedImage.size > 0) {
            console.log("[EXACT] Cache hit");
            setHttpMetadataHeaders(c, cachedImage.httpMetadata);
            c.header("Cache-Control", "public, max-age=31536000, immutable");
            c.header("X-Cache", "HIT");
            c.header("X-Cache-Type", "EXACT");

            return c.body(cachedImage.body);
        } else {
            c.header("X-Cache", "MISS");
            console.log("[EXACT] Cache miss");
        }
    } catch (error) {
        console.error("[EXACT] Error retrieving cached image:", error);
    }

    // No match found, continue handling the request
    await next();

    // store response image in R2 on the way out
    // Skip caching if:
    // - Response is not OK
    // - Content-type is not an image
    // - The response is itself a cache hit
    // - X-Error-Type header is present (error images should not be cached)
    // - It is a HEAD request (no body to store)
    if (
        c.res?.ok &&
        c.req.method !== "HEAD" &&
        !c.req.header("payment-signature") &&
        !c.req.header("x-payment") &&
        c.res.headers.get("content-type")?.includes("image/") &&
        // don't store a response that is itself a cache hit
        !(c.res.headers.get("x-cache") === "HIT") &&
        // don't cache error images (they have X-Error-Type header)
        !c.res.headers.get("x-error-type")
    ) {
        console.debug("[EXACT] Caching image response");
        c.executionCtx.waitUntil(cacheResponse(cacheKey, c));
    } else if (c.res.headers.get("x-error-type")) {
        console.debug("[EXACT] Skipping cache for error image:", c.res.headers.get("x-error-type"));
    }
});
