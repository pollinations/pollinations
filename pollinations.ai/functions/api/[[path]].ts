/**
 * Cloudflare Pages Function: API Proxy
 * Proxies /api/* requests to enter.pollinations.ai with secret API key
 *
 * File path: functions/api/[[path]].ts
 * This catches all routes under /api/*
 */

interface Env {
    PLN_APPS_KEY: string;
}

interface CFContext {
    request: Request;
    env: Env;
    params: { path?: string[] };
}

const ENTER_BASE_URL = "https://enter.pollinations.ai/api";

export async function onRequest(context: CFContext): Promise<Response> {
    const { request, env, params } = context;
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
        return new Response(null, {
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
            },
        });
    }

    // Build target path from catch-all params
    const pathSegments = params.path as string[];
    const targetPath = pathSegments ? `/${pathSegments.join("/")}` : "";
    const targetUrl = `${ENTER_BASE_URL}${targetPath}${url.search}`;

    // Clone headers and add auth
    const headers = new Headers(request.headers);
    headers.set("Authorization", `Bearer ${env.PLN_APPS_KEY}`);

    // Forward the request
    const proxyRequest = new Request(targetUrl, {
        method: request.method,
        headers,
        body:
            request.method !== "GET" && request.method !== "HEAD"
                ? request.body
                : undefined,
    });

    try {
        const response = await fetch(proxyRequest);

        // Return response with CORS headers
        const responseHeaders = new Headers(response.headers);
        responseHeaders.set("Access-Control-Allow-Origin", "*");

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
        });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unknown error";
        return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}
