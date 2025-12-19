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

// Fix unencoded nested URLs in the image param
// Strategy: collect all params, find duplicates, keep outer ones and encode nested URL
function fixNestedImageUrls(rawUrl: string): string {
    const imageMatch = rawUrl.match(/([?&])(image=)(https?:\/\/)/i);
    if (!imageMatch || imageMatch.index === undefined) return rawUrl;

    const nestedUrlStart = imageMatch.index + imageMatch[1].length + imageMatch[2].length;

    // Known top-level params for image generation
    // Keep in sync with: enter.pollinations.ai/src/schemas/image.ts
    const topLevelParams = new Set([
        'model', 'width', 'height', 'seed', 'enhance', 'negative_prompt',
        'private', 'nologo', 'nofeed', 'safe', 'quality', 'transparent',
        'guidance_scale', 'duration', 'aspectratio', 'audio', 'key', 'image'
    ]);

    // Find params BEFORE image= (definitely outer)
    const beforeImage = rawUrl.slice(0, imageMatch.index);
    const outerParamsBefore = new Set<string>();
    for (const m of beforeImage.matchAll(/[?&]([^=&]+)=/g)) {
        outerParamsBefore.add(m[1].toLowerCase());
    }

    const afterNestedUrlStart = rawUrl.slice(nestedUrlStart);
    const nestedQueryIdx = afterNestedUrlStart.indexOf('?');
    let nestedUrlEnd = afterNestedUrlStart.length;

    if (nestedQueryIdx !== -1) {
        // Nested URL has query string - find where outer params start
        const queryPart = afterNestedUrlStart.slice(nestedQueryIdx + 1);
        const params = queryPart.split('&');
        const seenInNested = new Set<string>();
        let offset = nestedQueryIdx + 1;

        for (const param of params) {
            const name = param.split('=')[0].toLowerCase();

            // Cut at: duplicate param OR param that was before image=
            if (seenInNested.has(name) || outerParamsBefore.has(name)) {
                nestedUrlEnd = offset - 1;
                break;
            }

            seenInNested.add(name);
            offset += param.length + 1;
        }
    } else {
        // No ? in nested URL - first known top-level param after it is outer
        const paramMatch = afterNestedUrlStart.match(/&([^=&]+)=/);
        if (paramMatch && paramMatch.index !== undefined && topLevelParams.has(paramMatch[1].toLowerCase())) {
            nestedUrlEnd = paramMatch.index;
        }
    }

    const nestedUrl = afterNestedUrlStart.slice(0, nestedUrlEnd);
    const afterNested = afterNestedUrlStart.slice(nestedUrlEnd);

    return rawUrl.slice(0, nestedUrlStart) + encodeURIComponent(nestedUrl) + afterNested;
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const fixedUrl = fixNestedImageUrls(request.url);
        const url = new URL(fixedUrl);
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
