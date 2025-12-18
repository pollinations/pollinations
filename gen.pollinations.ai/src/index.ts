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

async function needsSimulatedStreaming(request: Request): Promise<boolean> {
    // Only apply to streaming chat completion requests
    if (request.method !== 'POST') return false;
    
    const url = new URL(request.url);
    if (!url.pathname.includes('/chat/completions') && !url.pathname.includes('/openai')) {
        return false;
    }

    try {
        const cloned = request.clone();
        const body = await cloned.json();
        
        // Check if streaming is enabled and model is gemini-search
        return body.stream === true && body.model === 'gemini-search';
    } catch {
        return false;
    }
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

        // Check if we need simulated streaming for gemini-search
        const needsSimulation = await needsSimulatedStreaming(request);

        // Forward via service binding (zero latency - same V8 isolate)
        const response = await env.ENTER.fetch(new Request(url, request));

        // Apply simulated streaming if needed
        if (needsSimulation && response.ok && response.headers.get('content-type')?.includes('text/event-stream')) {
            return simulatedStreaming(response);
        }

        return response;
    },
};
