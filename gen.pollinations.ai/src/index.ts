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
 *   gen.pollinations.ai/audio/*       → /api/generate/audio/*
 *   gen.pollinations.ai/v1/*          → /api/generate/v1/*
 *   gen.pollinations.ai/account/*     → /api/account/*
 */

interface Env {
    ENTER: Fetcher;
}

/** Append X-Robots-Tag to prevent search engines from indexing API responses */
function noIndex(response: Response): Response {
    const res = new Response(response.body, response);
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return res;
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        const path = url.pathname;

        // Serve robots.txt — block infinite generation paths, allow docs
        if (path === "/robots.txt") {
            return new Response(
                [
                    "User-agent: *",
                    "Allow: /api/docs",
                    "Allow: /api/docs/llm.txt",
                    "Disallow: /image/",
                    "Disallow: /text/",
                    "Disallow: /video/",
                    "Disallow: /audio/",
                    "Disallow: /v1/",
                    "Disallow: /api/generate/",
                    "Disallow: /api/v1/",
                ].join("\n"),
                { headers: { "Content-Type": "text/plain" } },
            );
        }

        // Redirect root and /docs to API docs
        if (path === "/" || path === "/docs") {
            return Response.redirect(`${url.origin}/api/docs`, 301);
        }

        // Convenience: /models → /api/generate/text/models (most common use case)
        if (path === "/models") {
            url.pathname = "/api/generate/text/models";
            return noIndex(await env.ENTER.fetch(url, request));
        }

        // Don't rewrite /api/* paths - they're already in the correct format
        // Allow docs to be indexed; block all other API routes
        if (path.startsWith("/api/")) {
            const response = await env.ENTER.fetch(request);
            return path.startsWith("/api/docs") ? response : noIndex(response);
        }

        // Account routes: /account/* → /api/account/*
        if (path.startsWith("/account")) {
            url.pathname = "/api" + path;
            return noIndex(await env.ENTER.fetch(url, request));
        }

        // Rewrite API paths: /image/*, /text/*, /v1/* → /api/generate/*
        url.pathname = "/api/generate" + path;

        // Forward via service binding (zero latency - same V8 isolate)
        return noIndex(await env.ENTER.fetch(url, request));
    },
};
