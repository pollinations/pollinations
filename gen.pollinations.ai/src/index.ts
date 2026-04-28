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

import { createGenerationApp } from "./generation.ts";
import { resolveRoute } from "./routing.ts";

export { PollenRateLimiter } from "./durable-objects/PollenRateLimiter.ts";

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
    shouldNoIndex = true,
): Promise<Response> {
    const response = await generationApp.fetch(
        rewriteRequest(request, url),
        env,
        ctx,
    );
    return shouldNoIndex ? noIndex(response) : response;
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
            return fetchGeneration(
                request,
                env,
                ctx,
                route.url,
                !route.url.pathname.startsWith("/docs"),
            );
        }

        if (route.kind === "notFound") {
            return noIndex(new Response("Not Found", { status: 404 }));
        }

        return fetchEnter(request, env, route.url, route.noIndex);
    },
};
