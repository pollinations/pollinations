import { Hono } from "hono";
import { cors } from "hono/cors";
import { proxy } from "hono/proxy";
import { deleteCacheEntry, generateCacheKey } from "./cache-utils.ts";
import type { Env } from "./env";
import { googleAnalytics } from "./middleware/analytics.ts";
import { exactCache } from "./middleware/exact-cache";
import { parseImageParams } from "./middleware/parse-image-params.ts";
import { semanticCache } from "./middleware/semantic-cache.ts";
import { setConnectingIp } from "./middleware/set-connecting-ip.ts";
import { turnstileVerification } from "./middleware/turnstile.ts";

const app = new Hono<Env>();

app.use(
    cors({
        origin: "*",
        allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
        allowHeaders: ["Content-Type"],
    }),
);

// Delete cache entry endpoint
// Usage: DELETE /delete/prompt/{prompt}?{same query params as original request}
app.delete("/delete/prompt/:prompt", async (c) => {
    const url = new URL(c.req.url);
    // Transform the URL to match the original cache key format
    // Replace /delete/prompt/ with /prompt/
    url.pathname = url.pathname.replace(/^\/delete\/prompt\//, "/prompt/");
    
    const cacheKey = generateCacheKey(url);
    console.log("[DELETE] Deleting cache entry:", cacheKey);
    
    const result = await deleteCacheEntry(cacheKey, c.env);
    
    if (result.r2Deleted || result.vectorDeleted) {
        return c.json({
            success: true,
            cacheKey,
            r2Deleted: result.r2Deleted,
            vectorDeleted: result.vectorDeleted,
        });
    } else {
        return c.json({
            success: false,
            cacheKey,
            message: "Cache entry not found or already deleted",
            r2Deleted: result.r2Deleted,
            vectorDeleted: result.vectorDeleted,
        }, 404);
    }
});

// cache and proxy image requests
app.all(
    "/prompt/:prompt",
    googleAnalytics,
    setConnectingIp,
    turnstileVerification,
    parseImageParams,
    exactCache,
    semanticCache,
    async (c) => {
        const clientIP = c.get("connectingIp");
        const targetUrl = new URL(c.req.url);
        targetUrl.hostname = c.env.ORIGIN_HOST;
        targetUrl.port = "";
        console.debug("[PROXY] Forwarding to origin:", targetUrl.toString());
        const response = await proxy(targetUrl, {
            ...c.req,
            headers: {
                ...c.req.header(),
                "x-forwarded-for": clientIP,
                "x-forwarded-host": c.req.header("host"),
                "x-real-ip": clientIP,
                "cf-connecting-ip": clientIP,
            },
        });
        response.headers.set("X-Cache", "MISS");
        return response;
    },
);

// proxy other requests as is
app.all("*", setConnectingIp, async (c) => {
    const clientIP = c.get("connectingIp");
    const targetUrl = new URL(c.req.url);
    targetUrl.hostname = c.env.ORIGIN_HOST;
    targetUrl.port = "";
    console.debug("[PROXY] Forwarding to origin:", targetUrl.toString());
    return proxy(targetUrl, {
        ...c.req,
        headers: {
            ...c.req.header(),
            "x-forwarded-for": clientIP,
            "x-forwarded-host": c.req.header("host"),
            "x-real-ip": clientIP,
            "cf-connecting-ip": clientIP,
        },
    });
});

export default app;
