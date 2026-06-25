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
 *   gen.pollinations.ai/quests/catalog -> public quest catalog from enter
 *   gen.pollinations.ai/image/*       -> image generation
 *   gen.pollinations.ai/text/*        -> text generation
 *   gen.pollinations.ai/audio/*       -> audio generation
 *   gen.pollinations.ai/video/*       -> video generation
 *   gen.pollinations.ai/v1/*          -> OpenAI-compatible generation
 */

import { handleError } from "@shared/error.ts";
import { getPublicOrigin } from "@shared/public-origin.ts";
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { requestId } from "hono/request-id";
import type { Env } from "@/env.ts";
import { logger } from "@/middleware/logger.ts";
import { audioRoutes } from "./routes/audio.ts";
import { buildMergedOpenApiSpec, createDocsRoutes } from "./routes/docs.ts";
import { proxyRoutes } from "./routes/proxy.ts";

export { PollenRateLimiter } from "./durable-objects/PollenRateLimiter.ts";

const app = new Hono<Env>();

const PERMISSIVE_CORS_OPTIONS = {
    origin: "*",
    allowMethods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    // Empty allowHeaders makes Hono reflect Access-Control-Request-Headers.
    allowHeaders: [],
    // Public API responses are bearer-token based, not credentialed cookies.
    exposeHeaders: ["*"],
    maxAge: 600,
};

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
            "Disallow: /embeddings/",
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

function isDocsPath(path: string): boolean {
    return (
        path === "/docs" ||
        path.startsWith("/docs/") ||
        path === "/openapi.json"
    );
}

function redirectLegacyDocs(c: Context<Env>): Response {
    const reqUrl = new URL(c.req.url);
    const publicOrigin = new URL(getPublicOrigin(c));
    const url = new URL(reqUrl.pathname + reqUrl.search, publicOrigin);
    url.pathname = url.pathname.replace(/^\/api\/docs(?=\/|$)/, "/docs");
    url.pathname = stripTrailingSlash(url.pathname);
    return c.redirect(url.toString(), 301);
}

app.use("*", cors(PERMISSIVE_CORS_OPTIONS))
    .use("*", requestId())
    .use("*", logger)
    .get("/robots.txt", () => robotsTxt())
    .get("/", (c) => c.redirect(`${getPublicOrigin(c)}/docs`, 301))
    .get("/docs/", (c) => c.redirect(`${getPublicOrigin(c)}/docs`, 301))
    .all("/api/docs", redirectLegacyDocs)
    .all("/api/docs/", redirectLegacyDocs)
    .all("/api/docs/*", redirectLegacyDocs)
    .all("/api", () => notFound())
    .all("/api/*", () => notFound())
    .all("/account", (c) => fetchEnter(c, new URL(c.req.url)))
    .all("/account/", (c) => fetchEnter(c, new URL(c.req.url)))
    .all("/account/*", (c) => {
        const url = new URL(c.req.url);
        url.pathname = `/api${stripTrailingSlash(url.pathname)}`;
        return fetchEnter(c, url);
    })
    // Only the read-only quest catalog is part of the public gen API. Dashboard
    // quest actions (/check, /rewards, /claim) stay on enter's session API.
    .all("/quests/catalog", (c) => {
        if (c.req.method !== "GET" && c.req.method !== "HEAD") {
            return notFound();
        }
        const url = new URL(c.req.url);
        url.pathname = `/api${stripTrailingSlash(url.pathname)}`;
        return fetchEnter(c, url);
    })
    // Generation routes: docs, models, and media/text/audio/video APIs live at
    // the public gen origin without an internal /api prefix.
    .use("*", async (c, next) => {
        await next();
        if (!isDocsPath(c.req.path)) {
            c.header("X-Robots-Tag", "noindex, nofollow");
        }
    })
    .route("/docs", createDocsRoutes(app))
    .route("/v1/audio", audioRoutes)
    // Conventional, discoverable alias for the merged OpenAPI spec. JSON-only;
    // the ?format=yaml passthrough stays on /docs/open-api/generate-schema.
    // Must be registered before the "/" proxy catch-all or it gets shadowed.
    .get("/openapi.json", async (c) => {
        const merged = await buildMergedOpenApiSpec(c, app);
        return c.json(merged);
    })
    .route("/", proxyRoutes);

app.notFound(async (c: Context<Env>) => {
    return handleError(new HTTPException(404), c);
});

app.onError(handleError);

export default {
    fetch: app.fetch,
};
