/**
 * gen.pollinations.ai - API generation gateway
 *
 * Generation, account API, and docs routes are handled in this worker. Auth,
 * billing UI, and other control-plane routes remain owned by enter.pollinations.ai.
 *
 * URL Mapping:
 *   gen.pollinations.ai/              -> docs SEO landing
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

import { WorkerEntrypoint } from "cloudflare:workers";
import { handleError } from "@shared/error.ts";
import { requestId } from "@shared/middleware/request-id.ts";
import { getPublicOrigin } from "@shared/public-origin.ts";
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import type { Env } from "@/env.ts";
import { logger } from "@/middleware/logger.ts";
import {
    type GenerationExecutionProps,
    type GenerationExecutionResult,
    INTERNAL_CACHE_WRITE_HEADER,
} from "@/utils/idempotent-generation.ts";
import { audioRoutes } from "./routes/audio.ts";
import { buildMergedOpenApiSpec, createDocsRoutes } from "./routes/docs.ts";
import { modelStatusRoutes } from "./routes/model-status.ts";
import { proxyRoutes } from "./routes/proxy.ts";
import { docsLandingHtml, manifestResponse } from "./routes/seo.ts";

export { GenerationCoordinator } from "./durable-objects/GenerationCoordinator.ts";
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
    .get("/manifest.webmanifest", () => manifestResponse())
    .get("/", (c) => c.html(docsLandingHtml(c)))
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
    .route("/", modelStatusRoutes)
    .route("/", proxyRoutes);

app.notFound(async (c: Context<Env>) => {
    return handleError(new HTTPException(404), c);
});

app.onError(handleError);

async function drainResponseBody(
    response: Response,
    collect: boolean,
): Promise<string | undefined> {
    const reader = response.body?.getReader();
    if (!reader) return undefined;

    const chunks: Uint8Array[] = [];
    let collected = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (collect && collected < 16_384) {
            const chunk = value.slice(0, 16_384 - collected);
            chunks.push(chunk);
            collected += chunk.byteLength;
        }
    }
    if (!collect) return undefined;

    const body = new Uint8Array(collected);
    let offset = 0;
    for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return new TextDecoder().decode(body);
}

async function settleWaitUntil(promises: Promise<unknown>[]): Promise<void> {
    let settled = 0;
    while (settled < promises.length) {
        const batch = promises.slice(settled);
        settled = promises.length;
        await Promise.all(batch);
    }
}

/** Trusted loopback entrypoint used only by GenerationCoordinator alarms. */
export class GenerationExecutor extends WorkerEntrypoint<
    CloudflareBindings,
    GenerationExecutionProps
> {
    async execute(request: Request): Promise<GenerationExecutionResult> {
        const promises: Promise<unknown>[] = [];
        const exports = (this.ctx as ExecutionContext & { exports: unknown })
            .exports;
        const executionCtx = {
            props: this.ctx.props,
            exports,
            waitUntil(promise: Promise<unknown>) {
                promises.push(promise);
            },
            passThroughOnException() {},
        } as ExecutionContext;

        const response = await app.fetch(request, this.env, executionCtx);
        const cached =
            response.headers.get("x-cache") === "HIT" ||
            response.headers.get(INTERNAL_CACHE_WRITE_HEADER) === "1";
        const body = await drainResponseBody(response, !cached);
        await settleWaitUntil(promises);

        if (cached) {
            return {
                cached: true,
                status: response.status,
                statusText: response.statusText,
            };
        }
        return {
            cached: false,
            retryable: true,
            status: response.ok ? 502 : response.status,
            statusText: response.ok ? "Bad Gateway" : response.statusText,
            contentType:
                response.headers.get("content-type") ||
                "text/plain; charset=utf-8",
            body:
                body ||
                (response.ok
                    ? "Generation response was not cacheable"
                    : response.statusText),
        };
    }
}

export default {
    fetch: app.fetch,
};
