import {
    buildServer,
    createMcpHandler,
} from "../../packages/mcp/src/server.js";

const mcpHandler = createMcpHandler(() => buildServer(), {
    legacy: "stateless",
    onerror: (error) => console.error(error),
});

function readBearerToken(request) {
    const authorization = request.headers.get("authorization");
    if (!authorization) return null;

    const [scheme, token] = authorization.trim().split(/\s+/, 2);
    if (scheme?.toLowerCase() !== "bearer" || !token) {
        return null;
    }
    return token;
}

function unauthorizedResponse() {
    return Response.json(
        {
            error: "unauthorized",
            message: "Send a Pollinations API key as a bearer token.",
        },
        {
            status: 401,
            headers: {
                "WWW-Authenticate": 'Bearer realm="mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "pollinations-mcp",
                transport: "streamable-http",
                endpoint: "/",
                stateless: true,
            });
        }

        if (url.pathname !== "/") {
            return new Response("Not found", { status: 404 });
        }

        // Tool calls carry the caller's key to Gen, and so to Enter's D1, from
        // Cloudflare's shared Workers IP, so cap each client IP here.
        const ip = request.headers.get("cf-connecting-ip");
        if (ip && !(await env.IP_RATE_LIMITER.limit({ key: ip })).success) {
            return Response.json(
                {
                    error: "rate_limited",
                    message: "Too many requests. Please slow down.",
                },
                { status: 429, headers: { "Retry-After": "10" } },
            );
        }

        const token = readBearerToken(request);
        if (!token) return unauthorizedResponse();

        if (
            request.method === "POST" &&
            Array.isArray(
                await request
                    .clone()
                    .json()
                    .catch(() => null),
            )
        ) {
            return Response.json(
                {
                    error: "invalid_request",
                    message: "Batch requests are not supported.",
                },
                { status: 400 },
            );
        }

        return mcpHandler.fetch(request, {
            authInfo: {
                token,
                clientId: "pollinations-api-key",
                scopes: [],
            },
        });
    },
};
