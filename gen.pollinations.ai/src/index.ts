/**
 * gen.pollinations.ai - Simplified API Gateway
 *
 * This worker provides clean, short URLs for the Pollinations API by proxying
 * requests to enter.pollinations.ai via service bindings (zero latency).
 *
 * URL Mapping:
 *   gen.pollinations.ai/              → redirect to /api/docs
 *   gen.pollinations.ai/docs          → redirect to /api/docs
 *   gen.pollinations.ai/models        → /api/generate/text/models
 *   gen.pollinations.ai/image/*       → /api/generate/image/*
 *   gen.pollinations.ai/text/*        → /api/generate/text/*
 *   gen.pollinations.ai/v1/*          → /api/generate/v1/*
 *   gen.pollinations.ai/openai        → /api/generate/openai
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

        // Convenience: /models → /api/generate/text/models (most common use case)
        if (path === "/models") {
            url.pathname = "/api/generate/text/models";
            return env.ENTER.fetch(new Request(url, request));
        }

        // Don't rewrite /api/* paths - they're already in the correct format
        if (path.startsWith("/api/")) {
            return env.ENTER.fetch(request);
        }

        // Rewrite API paths: /image/*, /text/*, /v1/*, /openai → /api/generate/*
        // Examples:
        //   /image/models        → /api/generate/image/models
        //   /image/my-prompt     → /api/generate/image/my-prompt
        //   /text/hello          → /api/generate/text/hello
        //   /v1/chat/completions → /api/generate/v1/chat/completions
        //   /openai              → /api/generate/openai
        url.pathname = "/api/generate" + path;

        // Forward via service binding (zero latency - same V8 isolate)
        return env.ENTER.fetch(new Request(url, request));
    },
};
