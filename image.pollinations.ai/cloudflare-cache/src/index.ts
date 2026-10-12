import { Hono } from "hono";
import { cors } from "hono/cors";
import { proxy } from "hono/proxy";
import { ATTRIBUTION_HEADERS, addAttributionHeaders } from "./attribution.ts";
import {
    deleteCacheEntry,
    generateCacheKey,
    generateLegacyCacheKey,
} from "./cache-utils.ts";
import type { Env } from "./env";
import { exactCache } from "./middleware/exact-cache";
import { setConnectingIp } from "./middleware/set-connecting-ip.ts";
import { turnstileVerification } from "./middleware/turnstile.ts";
import { originHeaders } from "./util.ts";

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

// cache and proxy image requests
app.all(
    "/prompt/:prompt",
    setConnectingIp,
    turnstileVerification,
    exactCache,
    async (c) => {
        const clientIP = c.get("connectingIp");
        const targetUrl = new URL(c.req.url);
        targetUrl.hostname = c.env.ORIGIN_HOST;
        targetUrl.port = "";
        console.debug("[PROXY] Forwarding to origin:", targetUrl.toString());
        const response = await proxy(targetUrl, {
            ...c.req,
            headers: originHeaders(c.req.header(), clientIP),
        });
        response.headers.set("X-Cache", "MISS");
        return response;
    },
);

// proxy known utility endpoints as-is
app.all("*", setConnectingIp, async (c) => {
    const clientIP = c.get("connectingIp");
    const url = new URL(c.req.url);
    const pathname = url.pathname;

    // Known utility paths pass through directly
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

    // Everything else gets rewritten to /prompt/
    if (
        !isUtility &&
        !pathname.startsWith("/prompt") &&
        !pathname.startsWith("/delete")
    ) {
        url.pathname = `/prompt${pathname}`;
    }

    url.hostname = c.env.ORIGIN_HOST;
    url.port = "";
    console.debug("[PROXY] Forwarding to origin:", url.toString());
    return proxy(url, {
        ...c.req,
        headers: originHeaders(c.req.header(), clientIP),
    });
});

// Durable Object classes, unused until the adapter moves in
export { FeedHub } from "../../../shared/feed-hub.js";
export { IpSlot } from "../../../shared/ip-slot.js";

export default app;
