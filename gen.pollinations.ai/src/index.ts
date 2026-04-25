/**
 * gen.pollinations.ai - API generation gateway
 *
 * Generation routes are handled in this worker. Account, docs, auth, billing UI,
 * and other non-generation API routes remain owned by enter.pollinations.ai.
 *
 * URL Mapping:
 *   gen.pollinations.ai/              -> redirect to /api/docs
 *   gen.pollinations.ai/docs          -> redirect to /api/docs
 *   gen.pollinations.ai/models        -> /api/generate/text/models
 *   gen.pollinations.ai/api/generate/* -> handled locally
 *   gen.pollinations.ai/api/*         -> enter.pollinations.ai
 *   gen.pollinations.ai/account/*     -> /api/account/*
 *   gen.pollinations.ai/image/*       -> /api/generate/image/*
 *   gen.pollinations.ai/text/*        -> /api/generate/text/*
 *   gen.pollinations.ai/audio/*       -> /api/generate/audio/*
 *   gen.pollinations.ai/video/*       -> /api/generate/video/*
 *   gen.pollinations.ai/v1/*          -> /api/generate/v1/*
 */

import {
    type Context,
    type ErrorHandler,
    Hono,
    type MiddlewareHandler,
} from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { requestId } from "hono/request-id";
import type { Env as GenerationEnv } from "@/env.ts";
import { handleError } from "@/error.ts";
import { logger } from "@/middleware/logger.ts";
import { audioRoutes } from "@/routes/audio.ts";
import { proxyRoutes } from "@/routes/proxy.ts";
import { resolveRoute } from "./routing.ts";

interface Env extends CloudflareBindings {
    ENTER: Fetcher;
}

const generationLogger = logger as unknown as MiddlewareHandler<GenerationEnv>;
const generationErrorHandler =
    handleError as unknown as ErrorHandler<GenerationEnv>;
const generationProxyRoutes = proxyRoutes as unknown as Hono<GenerationEnv>;
const generationAudioRoutes = audioRoutes as unknown as Hono<GenerationEnv>;

const generationApp = new Hono<GenerationEnv>()
    // Permissive CORS for generation endpoints. Auth is API-key based.
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
    .use("*", generationLogger)
    .use("*", async (c, next) => {
        await next();
        c.header("X-Robots-Tag", "noindex, nofollow");
    })
    .route("/api/generate", generationProxyRoutes)
    .route("/api/generate/v1/audio", generationAudioRoutes);

generationApp.notFound(async (c: Context<GenerationEnv>) => {
    return generationErrorHandler(new HTTPException(404), c);
});

generationApp.onError(generationErrorHandler);

/** Append X-Robots-Tag to prevent search engines from indexing API responses. */
function noIndex(response: Response): Response {
    const res = new Response(response.body, response);
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return res;
}

function rewriteRequest(request: Request, url: URL): Request {
    return new Request(url.toString(), request);
}

async function fetchGeneration(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
    url: URL,
): Promise<Response> {
    return noIndex(
        await generationApp.fetch(rewriteRequest(request, url), env, ctx),
    );
}

async function fetchEnter(
    request: Request,
    env: Env,
    url: URL,
    shouldNoIndex: boolean,
): Promise<Response> {
    const response = await env.ENTER.fetch(rewriteRequest(request, url));
    return shouldNoIndex ? noIndex(response) : response;
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext) {
        const route = resolveRoute(new URL(request.url));

        if (route.kind === "robots") {
            return route.response;
        }

        if (route.kind === "redirect") {
            return Response.redirect(route.location, route.status);
        }

        if (route.kind === "generation") {
            return fetchGeneration(request, env, ctx, route.url);
        }

        return fetchEnter(request, env, route.url, route.noIndex);
    },
};
