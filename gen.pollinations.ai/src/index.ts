/**
 * gen.pollinations.ai - API Gateway
 *
 * Handles all generation routes (image, text, video, audio) directly:
 * - Edge caching, rate limiting, request deduplication
 * - Auth via enter's internal verify endpoint (service binding)
 * - Balance deduction via enter's internal deduct endpoint (service binding)
 * - Direct proxy to image/text backend services
 *
 * Forwards everything else to enter (auth, billing, dashboard, webhooks, docs).
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import type { Bindings, Env } from "./env.ts";
import { proxyRoutes } from "./routes/proxy.ts";

const app = new Hono<Env>()
    .use(
        "*",
        cors({
            origin: "*",
            allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            allowHeaders: ["Content-Type", "Authorization"],
            exposeHeaders: ["Content-Length", "Content-Disposition"],
            maxAge: 600,
        }),
    )
    .use("*", requestId());

/** Forward a request to enter via service binding */
function forwardToEnter(
    request: Request,
    url: URL,
    enter: Fetcher,
): Promise<Response> {
    return enter.fetch(url, request);
}

// Redirects
app.get("/", (c) =>
    Response.redirect(`${new URL(c.req.url).origin}/api/docs`, 302),
);
app.get("/docs", (c) =>
    Response.redirect(`${new URL(c.req.url).origin}/api/docs`, 302),
);

// /models shortcut → handled by proxy routes
app.get("/models", (c) => {
    const url = new URL(c.req.url);
    url.pathname = "/api/generate/text/models";
    return app.fetch(new Request(url, c.req.raw), c.env, c.executionCtx);
});

// Generation routes at /api/generate/*
app.route("/api/generate", proxyRoutes);

// Convenience URL rewrites: /image/*, /text/*, /audio/*, /video/*, /v1/* → /api/generate/*
const GEN_PREFIXES = ["/image/", "/text/", "/audio/", "/video/", "/v1/"];

app.all("*", (c) => {
    const url = new URL(c.req.url);
    const path = url.pathname;

    // /api/* → forward to enter (account, auth, billing, webhooks, docs, etc.)
    if (path.startsWith("/api/")) {
        return forwardToEnter(c.req.raw, url, c.env.ENTER);
    }

    // /account/* → /api/account/*
    if (path.startsWith("/account")) {
        url.pathname = "/api" + path;
        return forwardToEnter(c.req.raw, url, c.env.ENTER);
    }

    // Generation shorthand: rewrite and re-dispatch to proxy routes
    const isGenPath = GEN_PREFIXES.some((prefix) => path.startsWith(prefix));
    if (isGenPath) {
        url.pathname = "/api/generate" + path;
        return app.fetch(new Request(url, c.req.raw), c.env, c.executionCtx);
    }

    // Anything else: forward to enter
    url.pathname = "/api/generate" + path;
    return forwardToEnter(c.req.raw, url, c.env.ENTER);
});

export default {
    fetch: app.fetch,
} satisfies ExportedHandler<Bindings>;
