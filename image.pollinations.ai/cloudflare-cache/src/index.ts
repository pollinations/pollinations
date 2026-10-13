import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { ATTRIBUTION_HEADERS, addAttributionHeaders } from "./attribution.ts";
import {
    deleteCacheEntry,
    generateCacheKey,
    generateLegacyCacheKey,
} from "./cache-utils.ts";
import type { Env } from "./env";
import { exactCache } from "./middleware/exact-cache";
import { turnstileVerification } from "./middleware/turnstile.ts";
import { feed, generate, logFailure, utility } from "./origin.ts";

const app = new Hono<Env>();

app.use(
    cors({
        origin: "*",
        allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
        allowHeaders: ["*"],
        exposeHeaders: [
            ...Object.keys(ATTRIBUTION_HEADERS),
            "Payment-Required",
            "Payment-Response",
        ],
    }),
);

app.use("*", async (c, next) => {
    await next();
    if (c.res.ok) {
        addAttributionHeaders(c.res.headers);
    }
});

// Delete cache entry endpoint
// Usage: DELETE /delete/prompt/{prompt}?{same query params as original request}
app.delete("/delete/prompt/:prompt", async (c) => {
    const url = new URL(c.req.url);
    // Transform the URL to match the original cache key format
    // Replace /delete/prompt/ with /prompt/
    url.pathname = url.pathname.replace(/^\/delete\/prompt\//, "/prompt/");

    const cacheKey = generateCacheKey(url);
    const legacyCacheKey = generateLegacyCacheKey(url);
    console.log("[DELETE] Deleting cache entry:", cacheKey);

    const [current, legacy] = await Promise.all([
        deleteCacheEntry(cacheKey, c.env),
        deleteCacheEntry(legacyCacheKey, c.env),
    ]);
    const r2Deleted = current || legacy;

    if (r2Deleted) {
        return c.json({
            success: true,
            cacheKey,
            r2Deleted,
        });
    } else {
        return c.json(
            {
                success: false,
                cacheKey,
                message: "Cache entry not found or already deleted",
                r2Deleted,
            },
            404,
        );
    }
});

// cache image requests; misses are generated here
app.all("/prompt/:prompt", turnstileVerification, exactCache, async (c) => {
    const url = new URL(c.req.url);
    const response = await generateOr500(c, url, "/prompt/:prompt");
    response.headers.set("X-Cache", "MISS");
    return response;
});

// answer known utility endpoints; every other path generates as /prompt{path}
app.all("*", async (c) => {
    const url = new URL(c.req.url);
    const pathname = url.pathname;

    // Known utility paths keep their path
    const utilityPaths = [
        "/models",
        "/about",
        "/register",
        "/feed",
        "/crossdomain.xml",
        "/.well-known",
    ];
    const isUtility = utilityPaths.some(
        (p) => pathname === p || pathname.startsWith(p + "/"),
    );

    if (isUtility && pathname.startsWith("/feed")) {
        return feed(c.env, c.req.method, url.search);
    }
    if (isUtility) return utility(c.req.method, pathname);

    // Everything else gets rewritten to /prompt/
    if (!pathname.startsWith("/prompt") && !pathname.startsWith("/delete")) {
        url.pathname = `/prompt${pathname}`;
    }
    return generateOr500(c, url, "*");
});

/**
 * generate(), with an exception answered as Hono's default error handler
 * would. `url` is the request URL after the /prompt rewrite.
 */
async function generateOr500(c: Context<Env>, url: URL, route: string) {
    try {
        return await generate(c, url, route);
    } catch (error) {
        logFailure(route, { error: "exception", type: error.name });
        return c.text("Internal Server Error", 500);
    }
}

// Durable Object classes must be exported by the Worker's main module
export { FeedHub } from "../../../shared/feed-hub.js";
export { IpSlot } from "../../../shared/ip-slot.js";

export default app;
