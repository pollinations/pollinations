import { Hono } from "hono";
import { cors } from "hono/cors";
import { proxy } from "hono/proxy";
import type { Env } from "./env";
import { exactCache } from "./middleware/exact-cache";
import { parseImageParams } from "./middleware/parse-image-params.ts";
import { setConnectingIp } from "./middleware/set-connecting-ip.ts";
import { turnstileVerification } from "./middleware/turnstile.ts";

const app = new Hono<Env>();

app.use(
    cors({
        origin: "*",
        allowMethods: ["GET", "POST", "OPTIONS"],
        allowHeaders: ["Content-Type"],
    }),
);

/**
 * Build target URL from origin host and current request URL
 * Handles hostname:port format and sets HTTP protocol for AWS EC2
 */
function buildTargetUrl(originHost: string, requestUrl: string): URL {
    const targetUrl = new URL(requestUrl);
    const originParts = originHost.split(":");
    targetUrl.hostname = originParts[0];
    targetUrl.port = originParts[1] ?? ""; // Empty string for default port
    targetUrl.protocol = "http:"; // AWS EC2 uses HTTP
    return targetUrl;
}

// cache and proxy image requests
app.all(
    "/prompt/:prompt",
    setConnectingIp,
    turnstileVerification,
    parseImageParams,
    exactCache,
    async (c) => {
        const clientIP = c.get("connectingIp");
        const targetUrl = buildTargetUrl(c.env.ORIGIN_HOST, c.req.url);
        
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
    const targetUrl = buildTargetUrl(c.env.ORIGIN_HOST, c.req.url);
    
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
