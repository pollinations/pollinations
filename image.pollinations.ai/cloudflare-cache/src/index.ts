import { Hono } from "hono";
import { cors } from "hono/cors";
import { proxy } from "hono/proxy";
import type { Env } from "./env";
import { googleAnalytics } from "./middleware/analytics.ts";
import { exactCache } from "./middleware/exact-cache";
import { semanticCache } from "./middleware/semantic-cache.ts";
import { setConnectingIp } from "./middleware/set-connecting-ip.ts";

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
