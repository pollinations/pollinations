/**
 * Cloudflare Worker: API Proxy
 * Proxies requests to enter.pollinations.ai with the secret API key
 * The key is stored as an environment variable, never exposed to the browser
 */

interface Env {
    POLLINATIONS_API_KEY: string;
}

const ENTER_BASE_URL = "https://enter.pollinations.ai/api";

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        const path = url.pathname;

        // Handle CORS preflight
        if (request.method === "OPTIONS") {
            return new Response(null, {
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                    "Access-Control-Allow-Headers":
                        "Content-Type, Authorization",
                },
            });
        }

        // Only handle /api/* requests
        if (!path.startsWith("/api/")) {
            return new Response("Not found", { status: 404 });
        }

        // Remove /api prefix and forward to enter.pollinations.ai
        const targetPath = path.replace(/^\/api/, "");
        const targetUrl = `${ENTER_BASE_URL}${targetPath}${url.search}`;

        // Clone the request and add the API key from environment
        const headers = new Headers(request.headers);
        headers.set("Authorization", `Bearer ${env.POLLINATIONS_API_KEY}`);

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

            // Return the response with CORS headers
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
    },
};
