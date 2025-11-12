import { createMiddleware } from "hono/factory";
import { cacheResponse, generateCacheKey } from "../cache-utils.ts";
import { setHttpMetadataHeaders } from "../util.ts";

type Env = {
    Bindings: Cloudflare.Env;
    Variables: {
        cacheKey: string;
        connectingIp: string;
    };
};

export const exactCache = createMiddleware<Env>(async (c, next) => {
    // skip entirely if no-cache header is set
    if (c.req.header("no-cache")) return next();

    const cacheKey = generateCacheKey(new URL(c.req.url));
    console.debug("[EXACT] Cache key:", cacheKey);

    // store in context for reuse in semantic cache
    c.set("cacheKey", cacheKey);

    try {
        const cachedImage = await c.env.IMAGE_BUCKET.get(cacheKey);
        if (cachedImage) {
            console.log("[EXACT] Cache hit");
            setHttpMetadataHeaders(c, cachedImage.httpMetadata);
            c.header("Cache-Control", "public, max-age=31536000, immutable");
            c.header("X-Cache", "HIT");
            c.header("X-Cache-Type", "EXACT");
            return c.body(cachedImage.body);
        }
        
        console.log("[EXACT] Cache miss");
        c.header("X-Cache", "MISS");
    } catch (error) {
        console.error("[EXACT] Error retrieving cached image:", error);
    }

    // No match found, continue handling the request
    await next();

    // store response image in R2 on the way out
    const contentType = c.res?.headers.get("content-type");
    const xCache = c.res?.headers.get("x-cache");
    
    // Cache if: response is OK, is an image, and not already a cache hit
    // Note: We don't check Content-Length because responses may use chunked encoding
    if (
        c.res?.ok &&
        contentType?.includes("image/") &&
        xCache !== "HIT"
    ) {
        console.log("[EXACT] Caching image response");
        c.executionCtx.waitUntil(cacheResponse(cacheKey, c));
    }
});
