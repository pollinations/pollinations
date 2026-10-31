import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { ValidateSchema, validateJson } from "./validate.js";

function buildServer() {
    const server = new McpServer(
        { name: "json-schema-mcp", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "validate_json",
        {
            description:
                "Validate JSON text against a self-contained JSON Schema Draft 7. Returns valid plus bounded error locations; an invalid schema is a tool error. No coercion, defaults, model calls or network. $ref, regex keywords (pattern/patternProperties), format and other schema drafts are unsupported and rejected. Unknown extension keywords have no validation effect. Limits: 16 KiB schema, 64 KiB data, depth 32, 2,000 JSON values each. Stops at the first failing validation branch; reports at most 20 errors.",
            inputSchema: ValidateSchema,
            annotations: {
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false,
            },
        },
        async (input) => {
            try {
                const data = validateJson(input);
                return {
                    content: [{ type: "text", text: JSON.stringify(data) }],
                    structuredContent: data,
                };
            } catch (error) {
                return {
                    isError: true,
                    content: [{ type: "text", text: error.message }],
                };
            }
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

    const [scheme, token, extra] = authorization.trim().split(/\s+/);
    if (scheme?.toLowerCase() !== "bearer" || !token || extra) {
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
                    'Bearer realm="json-schema-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "json-schema-mcp",
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
