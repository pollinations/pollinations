/**
 * gen.pollinations.ai - API generation gateway
 *
 * Generation, account API, and docs routes are handled in this worker. Auth,
 * billing UI, and other control-plane routes remain owned by enter.pollinations.ai.
 *
 * URL Mapping:
 *   gen.pollinations.ai/              -> redirect to /docs
 *   gen.pollinations.ai/docs          -> docs handled locally
 *   gen.pollinations.ai/models        -> generation models
 *   gen.pollinations.ai/account/*     -> enter account API
 *   gen.pollinations.ai/image/*       -> image generation
 *   gen.pollinations.ai/text/*        -> text generation
 *   gen.pollinations.ai/audio/*       -> audio generation
 *   gen.pollinations.ai/video/*       -> video generation
 *   gen.pollinations.ai/v1/*          -> OpenAI-compatible generation
 */

import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { requestId } from "hono/request-id";
import type { Env } from "@/env.ts";
import { handleError } from "@/error.ts";
import { logger } from "@/middleware/logger.ts";
import { audioRoutes } from "./routes/audio.ts";
import { createDocsRoutes } from "./routes/docs.ts";
import { proxyRoutes } from "./routes/proxy.ts";

export { PollenRateLimiter } from "./durable-objects/PollenRateLimiter.ts";

const app = new Hono<Env>();

/** Append X-Robots-Tag to prevent search engines from indexing API responses. */
function noIndex(response: Response): Response {
    const res = new Response(response.body, response);
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return res;
}

function rewriteRequest(request: Request, url: URL): Request {
    return new Request(url.toString(), request);
}

function notFound(): Response {
    return noIndex(new Response("Not Found", { status: 404 }));
}

function robotsTxt(): Response {
    return new Response(
        [
            "User-agent: *",
            "Allow: /docs",
            "Allow: /docs/llm.txt",
            "Disallow: /image/",
            "Disallow: /text/",
            "Disallow: /video/",
            "Disallow: /audio/",
            "Disallow: /v1/",
            "Disallow: /api/",
        ].join("\n"),
        { headers: { "Content-Type": "text/plain" } },
    );
}

async function fetchEnter(c: Context<Env>, url: URL): Promise<Response> {
    const response = await c.env.ENTER.fetch(rewriteRequest(c.req.raw, url));
    return noIndex(response);
}

function stripTrailingSlash(path: string): string {
    return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

// Boundary routes: these are handled before generation middleware.
app.get("/robots.txt", () => robotsTxt())
    .get("/", (c) => c.redirect(`${new URL(c.req.url).origin}/docs`, 301))
    .get("/docs/", (c) => c.redirect(`${new URL(c.req.url).origin}/docs`, 301))
    .all("/api", () => notFound())
    .all("/api/*", () => notFound())
    .all("/account", (c) => fetchEnter(c, new URL(c.req.url)))
    .all("/account/", (c) => fetchEnter(c, new URL(c.req.url)))
    .all("/account/*", (c) => {
        const url = new URL(c.req.url);
        url.pathname = `/api${stripTrailingSlash(url.pathname)}`;
        return fetchEnter(c, url);
    })
    // Generation routes: docs, models, and media/text/audio/video APIs live at
    // the public gen origin without an internal /api prefix.
    .use(
        "*",
        cors({
            origin: "*",
            allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            allowHeaders: [],
            exposeHeaders: ["Content-Length", "Content-Disposition"],
            maxAge: 600,
        }),
    )
    .use("*", requestId())
    .use("*", logger)
    .use("*", async (c, next) => {
        await next();
        if (!c.req.path.startsWith("/docs")) {
            c.header("X-Robots-Tag", "noindex, nofollow");
        }
    })
    .route("/docs", createDocsRoutes(app))
    .route("/v1/audio", audioRoutes)
    .route("/", proxyRoutes);

app.notFound(async (c: Context<Env>) => {
    return handleError(new HTTPException(404), c);
});

app.onError(handleError);

export default {
    fetch: app.fetch,
};
