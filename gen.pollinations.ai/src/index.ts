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

import { createGenerationApp } from "./generation.ts";
import { resolveRoute } from "./routing.ts";

interface Env extends CloudflareBindings {
    ENTER: Fetcher;
}

const generationApp = createGenerationApp();

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
