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

import { simulatedStreaming } from './simulatedStreaming';

interface Env {
    ENTER: Fetcher;
}

function needsSimulatedStreaming(response: Response): boolean {
    // Apply to all streaming SSE responses
    // The content-length threshold (>50 chars) will filter out models that don't need it
    // This is more efficient - no request body parsing needed!
    
    const contentType = response.headers.get('content-type');
    return contentType?.includes('text/event-stream') ?? false;
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
        url.pathname = "/api/generate" + path;

        // Forward via service binding (zero latency - same V8 isolate)
        const response = await env.ENTER.fetch(new Request(url, request));

        // Apply simulated streaming to all SSE responses
        // The >50 char threshold filters out models that don't need it (zero overhead)
        if (response.ok && needsSimulatedStreaming(response)) {
            return simulatedStreaming(response);
        }

        return response;
    },
};
