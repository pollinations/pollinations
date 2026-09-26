import { once } from "node:events";
import { serve } from "@hono/node-server";
import { ADMIN_ORIGIN, ENTER_ORIGIN } from "./local-origins";

// Native OAuth redirects must stay in the same disposable runtime. Browser
// route interception alone does not cover every hop of a redirect chain.
export async function serveReviewTransport(
    productFetch: (request: Request) => Promise<Response>,
) {
    const server = serve({
        hostname: "127.0.0.1",
        port: 0,
        async fetch(request) {
            const url = new URL(request.url);
            if (![ENTER_ORIGIN, ADMIN_ORIGIN].includes(url.origin))
                return new Response("Local review origin required", {
                    status: 403,
                });
            if (
                /^\/(?:api|gen|__flow|auth|\.well-known)(?:\/|$)/.test(
                    url.pathname,
                )
            )
                return productFetch(request);
            if (!["GET", "HEAD"].includes(request.method))
                return new Response("Source files are read-only", {
                    status: 405,
                });
            const headers = new Headers(request.headers);
            headers.delete("cookie");
            headers.delete("authorization");
            return fetch(request.url, {
                method: request.method,
                headers,
                redirect: "manual",
            });
        },
    });
    await once(server, "listening");
    return server;
}
