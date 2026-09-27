import { once } from "node:events";
import { serve } from "@hono/node-server";
import { environmentScript, type SourceInfo } from "./flow-environment";
import { LOCAL_ORIGINS } from "./local-origins";
import { assetRequest } from "./source-assets";
import { readSourceInfo } from "./source-info";

// Native OAuth redirects must stay in the same disposable runtime. Browser
// route interception alone does not cover every hop of a redirect chain.
export async function serveReviewTransport(
    productFetch: (request: Request) => Promise<Response>,
    fetchAssets: (request: Request) => Promise<Response> = fetch,
    source?: SourceInfo,
) {
    const revision = source ?? (await readSourceInfo());
    const server = serve({
        hostname: "127.0.0.1",
        port: 0,
        async fetch(request) {
            const url = new URL(request.url);
            if (
                ![LOCAL_ORIGINS.enter, LOCAL_ORIGINS.admin].includes(url.origin)
            )
                return new Response("Local review origin required", {
                    status: 403,
                });
            if (url.pathname === "/__flow/config.js")
                return environmentScript({
                    ...LOCAL_ORIGINS,
                    source: revision,
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
            return fetchAssets(assetRequest(request, LOCAL_ORIGINS.admin));
        },
    });
    await once(server, "listening");
    return server;
}
