/**
 * Worker entry point for hello.pollinations.ai
 * Serves static assets only - API calls go directly to gen.pollinations.ai from frontend
 */

interface Env {
    PLN_APPS_KEY: string;
    ASSETS: { fetch: (request: Request) => Promise<Response> };
}

const ENTER_BASE_URL = "https://enter.pollinations.ai/api";

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);

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

        // Proxy /api/* requests to enter.pollinations.ai
        if (url.pathname.startsWith("/api/")) {
            const targetPath = url.pathname.replace(/^\/api/, "");
            const targetUrl = `${ENTER_BASE_URL}${targetPath}${url.search}`;

            // Clone headers and add auth
            const headers = new Headers(request.headers);
            headers.set("Authorization", `Bearer ${env.PLN_APPS_KEY}`);

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

        // For all other requests, serve static assets
        return env.ASSETS.fetch(request);
    },
};
