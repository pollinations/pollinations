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
        if (cachedImage && cachedImage.size > 0) {
            console.log("[EXACT] Cache hit");
            setHttpMetadataHeaders(c, cachedImage.httpMetadata);
            c.header("Cache-Control", "public, max-age=31536000, immutable");
            c.header("X-Cache", "HIT");
            c.header("X-Cache-Type", "EXACT");
            return c.body(cachedImage.body);
        }
        
        if (cachedImage?.size === 0) {
            console.warn("[EXACT] Skipping empty cached image");
        } else {
            console.log("[EXACT] Cache miss");
        }
        c.header("X-Cache", "MISS");
    } catch (error) {
        console.error("[EXACT] Error retrieving cached image:", error);
    }

    // No match found, continue handling the request
    await next();

    // store response image in R2 on the way out
    const contentLength = c.res?.headers.get("content-length");
    if (
        c.res?.ok &&
        c.res.headers.get("content-type")?.includes("image/") &&
        !(c.res.headers.get("x-cache") === "HIT") &&
        contentLength && contentLength !== "0"
    ) {
        console.debug("[EXACT] Caching image response");
        c.executionCtx.waitUntil(cacheResponse(cacheKey, c));
    }
});
