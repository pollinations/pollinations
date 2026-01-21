/**
 * gen.pollinations.ai - Simplified API Gateway
 *
 * This worker provides clean, short URLs for the Pollinations API by proxying
 * requests to enter.pollinations.ai via service bindings (zero latency).
 *
 * URL Mapping:
 *   gen.pollinations.ai/              → redirect to /api/docs
 *   gen.pollinations.ai/docs          → redirect to /api/docs
 *   gen.pollinations.ai/models        → /api/text/models
 *   gen.pollinations.ai/image/*       → /api/image/*
 *   gen.pollinations.ai/text/*        → /api/text/*
 *   gen.pollinations.ai/v1/*          → /api/v1/*
 *   gen.pollinations.ai/account/*     → /api/account/*
 */

interface Env {
    ENTER: Fetcher;
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        const path = url.pathname;

        // Redirect root and /docs to API docs
        if (path === "/" || path === "/docs") {
            return Response.redirect(`${url.origin}/api/docs`, 302);
        }

        // Convenience: /models → /api/text/models (most common use case)
        if (path === "/models") {
            url.pathname = "/api/text/models";
            return env.ENTER.fetch(url, request);
        }

        // Don't rewrite /api/* paths - they're already in the correct format
        if (path.startsWith("/api/")) {
            return env.ENTER.fetch(request);
        }

        // All other paths: prepend /api
        // /image/*, /text/*, /v1/*, /account/* → /api/*
        url.pathname = "/api" + path;

        // Forward via service binding (zero latency - same V8 isolate)
        return env.ENTER.fetch(url, request);
    },
};
