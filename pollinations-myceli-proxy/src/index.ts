interface Env {
    UPSTREAM_MAP: string;
}

export default {
    async fetch(req: Request, env: Env): Promise<Response> {
        const url = new URL(req.url);
        const publicHost = url.host;

        const upstreamHost = lookupUpstream(env.UPSTREAM_MAP, publicHost);
        if (!upstreamHost) {
            return new Response(`No upstream configured for ${publicHost}`, {
                status: 502,
            });
        }

        const upstreamUrl = new URL(req.url);
        upstreamUrl.host = upstreamHost;
        upstreamUrl.protocol = "https:";
        upstreamUrl.port = "";

        const headers = new Headers(req.headers);
        headers.set("X-Forwarded-Host", publicHost);
        headers.set("X-Forwarded-Proto", "https");

        const clientIp = req.headers.get("CF-Connecting-IP");
        if (clientIp) {
            headers.set("X-Original-Client-IP", clientIp);
            // Overwrite (not append) — the incoming X-Forwarded-For comes from
            // an untrusted client and must not be propagated as-is.
            headers.set("X-Forwarded-For", clientIp);
        } else {
            headers.delete("X-Original-Client-IP");
            headers.delete("X-Forwarded-For");
        }

        // Override Host so the upstream Worker's routing/SNI is correct.
        headers.set("Host", upstreamHost);

        const isWebSocketUpgrade =
            req.headers.get("Upgrade")?.toLowerCase() === "websocket";

        const hasBody = req.method !== "GET" && req.method !== "HEAD";
        let upstream: Response;
        try {
            upstream = await fetch(upstreamUrl.toString(), {
                method: req.method,
                headers,
                body: hasBody ? req.body : undefined,
                redirect: "manual",
            });
        } catch {
            return new Response("Bad Gateway", {
                status: 502,
                headers: {
                    "Content-Type": "text/plain; charset=utf-8",
                    "Cache-Control": "no-store",
                },
            });
        }

        // WebSocket upgrade responses carry a `webSocket` field that is lost
        // if the response is rebuilt with `new Response(...)`. Pass it through
        // unchanged so the client/upstream WS pair can hand-off.
        if (isWebSocketUpgrade && upstream.status === 101) {
            return upstream;
        }

        // Strip hop-by-hop and length headers so streaming bodies (SSE,
        // chunked responses) pass through without re-buffering.
        const respHeaders = new Headers(upstream.headers);
        respHeaders.delete("content-length");
        respHeaders.delete("transfer-encoding");
        respHeaders.delete("connection");

        const responseInit: ResponseInit & { encodeBody?: "manual" } = {
            status: upstream.status,
            statusText: upstream.statusText,
            headers: respHeaders,
        };
        if (respHeaders.has("content-encoding")) {
            responseInit.encodeBody = "manual";
        }

        return new Response(upstream.body, responseInit);
    },
};

function lookupUpstream(mapJson: string, host: string): string | undefined {
    try {
        const map = JSON.parse(mapJson) as Record<string, string>;
        return map[host];
    } catch {
        return undefined;
    }
}
