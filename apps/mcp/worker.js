import {
    buildServer,
    createMcpHandler,
} from "../../packages/mcp/src/server.js";

const mcpHandler = createMcpHandler(
    () => buildServer({ includeAuthTools: false }),
    {
        legacy: "stateless",
        onerror: (error) => console.error(error),
    },
);

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
        { status: 401 },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/" && request.method === "GET") {
            return Response.json({
                name: "pollinations-mcp",
                transport: "streamable-http",
                endpoint: "/mcp",
                stateless: true,
            });
        }

        if (url.pathname !== "/mcp") {
            return new Response("Not found", { status: 404 });
        }

        const token = readBearerToken(request);
        if (!token) return unauthorizedResponse();

        return mcpHandler.fetch(request, {
            authInfo: {
                token,
                clientId: "pollinations-api-key",
                scopes: [],
            },
        });
    },
};
