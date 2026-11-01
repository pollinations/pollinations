import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchJsonWithAuth,
} from "../../packages/mcp/src/utils/coreUtils.js";

const ENDPOINTS = [
    { name: "text", baseUrl: "https://gen.pollinations.ai/v1" },
    { name: "image", baseUrl: "https://gen.pollinations.ai/image" },
    { name: "audio", baseUrl: "https://gen.pollinations.ai/audio" },
    { name: "video", baseUrl: "https://gen.pollinations.ai/video" },
    { name: "3d", baseUrl: "https://gen.pollinations.ai/3d" },
    {
        name: "embeddings",
        baseUrl: "https://gen.pollinations.ai/v1/embeddings",
    },
];

function buildServer() {
    const server = new McpServer(
        {
            name: "pollinations-agent-discovery",
            title: "Pollinations Agent Discovery MCP",
            version: "0.1.0",
        },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "discover_models",
        {
            description: "Discover available Pollinations models.",
            inputSchema: {},
        },
        async (_args, context) => {
            const models = await fetchJsonWithAuth(
                buildUrl("/models"),
                {},
                context,
            );
            return createMCPResponse([createTextContent(models, true)]);
        },
    );
    server.registerTool(
        "discover_endpoints",
        {
            description: "Discover Pollinations API endpoints.",
            inputSchema: {},
        },
        async () => {
            return createMCPResponse([createTextContent(ENDPOINTS, true)]);
        },
    );
    server.registerTool(
        "get_agent_card",
        { description: "Get the Pollinations agent card.", inputSchema: {} },
        async (_args, context) => {
            const card = await fetchJsonWithAuth(
                buildUrl("/.well-known/agent-card.json"),
                {},
                context,
            );
            return createMCPResponse([createTextContent(card, true)]);
        },
    );
    return server;
}

const mcpHandler = createMcpHandler(() => buildServer(), {
    legacy: "stateless",
    onerror: (error) => console.error(error),
});

function readBearerToken(request) {
    const authorization = request.headers.get("authorization");
    if (!authorization) return null;
    const [scheme, token] = authorization.trim().split(/\s+/, 2);
    if (scheme?.toLowerCase() !== "bearer" || !token) return null;
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
                "WWW-Authenticate":
                    'Bearer realm="pollinations-agent-discovery.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "pollinations-agent-discovery",
                transport: "streamable-http",
                endpoint: "/",
                stateless: true,
            });
        }
        if (url.pathname !== "/")
            return new Response("Not found", { status: 404 });
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
            authInfo: { token, clientId: "pollinations-api-key", scopes: [] },
        });
    },
};
