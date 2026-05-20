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

        const upstream = await fetch(upstreamUrl.toString(), {
            method: req.method,
            headers,
            body: req.body,
            redirect: "manual",
        });

        // Strip hop-by-hop and length/encoding headers so streaming bodies
        // (SSE, chunked responses) pass through without re-buffering.
        const respHeaders = new Headers(upstream.headers);
        respHeaders.delete("content-length");
        respHeaders.delete("content-encoding");
        respHeaders.delete("transfer-encoding");
        respHeaders.delete("connection");

        return new Response(upstream.body, {
            status: upstream.status,
            statusText: upstream.statusText,
            headers: respHeaders,
        });
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
