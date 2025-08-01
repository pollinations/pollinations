import { Hono } from "hono";
import { cors } from "hono/cors";
import { proxy } from "hono/proxy";
import type { Env } from "./env";
import { exactCache } from "./middleware/exact-cache";
import { semanticCache } from "./middleware/semantic-cache.ts";
import { setConnectingIp } from "./middleware/set-connecting-ip.ts";
import { googleAnalytics } from "./middleware/analytics.ts";

const app = new Hono<Env>();

app.use(
    cors({
        origin: "*",
        allowMethods: ["GET", "POST", "OPTIONS"],
        allowHeaders: ["Content-Type"],
    }),
);

app.all(
    "/prompt/:prompt",
    googleAnalytics,
    setConnectingIp,
    exactCache,
    semanticCache,
    (c) => {
        const clientIP = c.get("connectingIp");
        const targetUrl = new URL(c.req.url);
        targetUrl.hostname = c.env.ORIGIN_HOST || "image.pollinations.ai";
        targetUrl.port = "";
        console.debug(
            "[PROXY] Forwarding request to origin:",
            targetUrl.toString(),
        );
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
    },
);

export default app;
