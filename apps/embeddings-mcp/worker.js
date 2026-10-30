import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchJsonWithAuth,
} from "../../packages/mcp/src/utils/coreUtils.js";

const DEFAULT_MODEL = "openai/text-embedding-3-small";

function buildServer() {
    const server = new McpServer(
        { name: "embeddings-mcp", title: "Embeddings MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "embed",
        {
            description:
                "Create embeddings for one text or a batch of texts, using the caller's " +
                "Pollinations key. Use the returned vectors for semantic search, clustering, " +
                "deduplication, and RAG indexes. Vector order matches input order.",
            inputSchema: {
                input: z
                    .union([z.string(), z.array(z.string()).min(1)])
                    .describe(
                        "Text to embed, or an array of texts for a batch.",
                    ),
                model: z
                    .string()
                    .optional()
                    .describe(
                        `Embedding model ID. Defaults to ${DEFAULT_MODEL}.`,
                    ),
                dimensions: z
                    .number()
                    .int()
                    .positive()
                    .optional()
                    .describe(
                        "Optional output vector size reduction, e.g. 512. Only for models that support it.",
                    ),
            },
        },
        async ({ input, model, dimensions }, context) => {
            const body = {
                model: model ?? DEFAULT_MODEL,
                input,
                ...(dimensions !== undefined ? { dimensions } : {}),
            };
            const data = await fetchJsonWithAuth(
                buildUrl("/v1/embeddings"),
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                },
                context,
            );
            return createMCPResponse([createTextContent(JSON.stringify(data))]);
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
                "WWW-Authenticate":
                    'Bearer realm="embeddings-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "embeddings-mcp",
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
