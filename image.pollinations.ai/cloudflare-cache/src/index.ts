import { Hono } from "hono";
import { cors } from "hono/cors";
import { proxy } from "hono/proxy";
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
        allowMethods: ["GET", "POST", "OPTIONS"],
        allowHeaders: ["Content-Type"],
    }),
);

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
        
        // Handle ORIGIN_HOST with optional port (e.g., "host:port" or just "host")
        const originParts = c.env.ORIGIN_HOST.split(":");
        targetUrl.hostname = originParts[0];
        targetUrl.port = originParts[1] || "";
        targetUrl.protocol = "http:"; // AWS EC2 uses HTTP
        
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
    
    // Handle ORIGIN_HOST with optional port (e.g., "host:port" or just "host")
    const originParts = c.env.ORIGIN_HOST.split(":");
    targetUrl.hostname = originParts[0];
    targetUrl.port = originParts[1] || "";
    targetUrl.protocol = "http:"; // AWS EC2 uses HTTP
    
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
