/**
 * gen.pollinations.ai - Simplified API Gateway
 *
 * This worker provides clean, short URLs for the Pollinations API by proxying
 * requests to enter.pollinations.ai via service bindings (zero latency).\
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

// Models known to have buffering issues that benefit from simulated streaming
const MODELS_NEEDING_SIMULATION = [
    'gemini-search',
    // Add other models here if they exhibit similar mega-chunk behavior
];

async function needsSimulatedStreaming(request: Request): Promise<boolean> {
    // Only apply to streaming chat completion requests
    if (request.method !== 'POST') return false;
    
    const url = new URL(request.url);
    
    // PERFORMANCE FIX: Only check chat completion endpoints
    if (!url.pathname.includes('/chat/completions') && !url.pathname.includes('/openai')) {
        return false;
    }

    try {
        const cloned = request.clone();
        const body = await cloned.json();
        
        // SCOPE FIX: Only apply to specific models known to have buffering issues
        // This prevents unnecessary CPU overhead for healthy streaming models (OpenAI, Llama, etc.)
        return body.stream === true && MODELS_NEEDING_SIMULATION.includes(body.model);
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

        // Check if we need simulated streaming (only for specific models)
        const needsSimulation = await needsSimulatedStreaming(request);

        // Forward via service binding (zero latency - same V8 isolate)
        const response = await env.ENTER.fetch(new Request(url, request));

        // Apply simulated streaming ONLY if:
        // 1. Specific model needs it (gemini-search, etc.)
        // 2. Response is successful
        // 3. Response is actually a streaming response
        if (needsSimulation && response.ok && response.headers.get('content-type')?.includes('text/event-stream')) {
            return simulatedStreaming(response);
        }

        return response;
    },
};
