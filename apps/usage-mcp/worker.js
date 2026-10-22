import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

const GEN_BASE = "https://gen.pollinations.ai";

function buildServer() {
    const server = new McpServer(
        { name: "usage-mcp", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );

    // Tool 1: get_balance
    server.registerTool(
        "get_balance",
        {
            description: "Get the caller's current pollen balance",
            inputSchema: z.object({}),
        },
        async (_args, context) => {
            const token = context.http.authInfo.token;
            const res = await fetch(`${GEN_BASE}/account/balance`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                return upstreamError(res);
            }
            const data = await res.json();
            return createMCPResponse([createTextContent(data, true)]);
        },
    );

    // Tool 2: get_usage_history
    server.registerTool(
        "get_usage_history",
        {
            description:
                "Get recent generation usage history: model, cost, and timestamp per request",
            inputSchema: z.object({
                limit: z
                    .number()
                    .int()
                    .min(1)
                    .max(100)
                    .default(20)
                    .describe("Number of recent requests to return"),
            }),
        },
        async ({ limit }, context) => {
            const token = context.http.authInfo.token;
            const res = await fetch(
                `${GEN_BASE}/account/usage?limit=${limit}`,
                {
                    headers: { Authorization: `Bearer ${token}` },
                },
            );
            if (!res.ok) {
                return upstreamError(res);
            }
            const data = await res.json();
            return createMCPResponse([createTextContent(data, true)]);
        },
    );

    // Tool 3: get_model_info
    server.registerTool(
        "get_model_info",
        {
            description:
                "Get information about a specific model: capabilities, pricing, and metadata",
            inputSchema: z.object({
                model_name: z
                    .string()
                    .min(1)
                    .describe("Model id or alias, e.g. 'openai/gpt-5-nano'"),
            }),
        },
        async ({ model_name }, context) => {
            const token = context.http.authInfo.token;
            // OpenAI-compatible retrieve route. `/models/<id>` is not a route;
            // the single-model endpoint is `/v1/models/<id>` (ids contain a
            // slash, hence the encoding).
            const res = await fetch(
                `${GEN_BASE}/v1/models/${encodeURIComponent(model_name)}`,
                {
                    headers: { Authorization: `Bearer ${token}` },
                },
            );
            if (!res.ok) {
                return upstreamError(res);
            }
            const data = await res.json();
            return createMCPResponse([createTextContent(data, true)]);
        },
    );

    return server;
}

async function upstreamError(res) {
    const text = await res.text().catch(() => "Unknown error");
    return {
        content: [
            createTextContent({ error: `HTTP ${res.status}: ${text}` }, true),
        ],
        isError: true,
    };
}

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
                "WWW-Authenticate": 'Bearer realm="usage-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "usage-mcp",
                transport: "streamable-http",
                endpoint: "/",
                stateless: true,
            });
        }

        if (url.pathname !== "/") {
            return new Response("Not found", { status: 404 });
        }

        const token = readBearerToken(request);
        if (!token) return unauthorizedResponse();

        // Clone before reading: the MCP handler needs the body too.
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
