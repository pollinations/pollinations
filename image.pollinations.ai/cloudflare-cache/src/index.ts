import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { proxy } from "hono/proxy";
// piexif-ts builds a Function when it loads, which Workers allow only at
// startup, not in brand.ts's lazy load during a request
import "piexif-ts/dist/piexif.js";
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
import { feed, generate, logFailure, utility } from "./origin.ts";
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

// cache image requests; misses are generated here or on the VM
app.all(
    "/prompt/:prompt",
    setConnectingIp,
    turnstileVerification,
    exactCache,
    async (c) => {
        const url = new URL(c.req.url);
        const response = await missToOrigin(c, url, "/prompt/:prompt");
        response.headers.set("X-Cache", "MISS");
        return response;
    },
);

// answer known utility endpoints; every other path generates as /prompt{path}
app.all("*", setConnectingIp, async (c) => {
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
        // Until every generation runs here, the VM's feed has most events
        if (Number(c.env.ADAPTER_SHARE ?? 0) < 100) return toVm(c, url);
        return feed(c.env, c.req.method, url.search);
    }
    if (isUtility) return utility(c.req.method, pathname);

    // Everything else gets rewritten to /prompt/
    if (!pathname.startsWith("/prompt") && !pathname.startsWith("/delete")) {
        url.pathname = `/prompt${pathname}`;
    }
    return missToOrigin(c, url, "*");
});

/**
 * Sends a request to generate() for ADAPTER_SHARE percent of requests and to
 * the VM otherwise, and labels the response, exceptions included, with the
 * path it took. `url` is the request URL after the /prompt rewrite.
 */
async function missToOrigin(c: Context<Env>, url: URL, route: string) {
    const path =
        Math.random() * 100 < Number(c.env.ADAPTER_SHARE ?? 0)
            ? "worker"
            : "vm";
    let response: Response;
    try {
        response =
            path === "worker"
                ? await generate(c, url, route)
                : await toVm(c, url);
    } catch (error) {
        // What Hono's default error handler answered
        logFailure(route, { error: "exception", path, type: error.name });
        response = c.text("Internal Server Error", 500);
    }
    response.headers.set("X-Legacy-Path", path);
    return response;
}

/** Proxies the request to the VM through the tunnel */
function toVm(c: Context<Env>, url: URL) {
    const clientIP = c.get("connectingIp");
    url.hostname = c.env.ORIGIN_HOST;
    url.port = "";
    console.debug("[PROXY] Forwarding to origin:", url.toString());
    return proxy(url, {
        ...c.req,
        headers: originHeaders(c.req.header(), clientIP),
    });
}

// Durable Object classes must be exported by the Worker's main module
export { FeedHub } from "../../../shared/feed-hub.js";
export { IpSlot } from "../../../shared/ip-slot.js";

export default app;
