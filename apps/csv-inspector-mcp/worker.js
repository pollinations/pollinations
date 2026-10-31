import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { InspectSchema, inspectCsv } from "./inspect.js";

function buildServer() {
    const server = new McpServer(
        { name: "csv-inspector-mcp", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "inspect_csv",
        {
            description:
                "Inspect pasted CSV locally: auto-detect comma, semicolon, tab or pipe, summarize columns and report ragged rows. Set header=false for headerless data. Ambiguous delimiters require an explicit choice. Limits: 128 KiB, 10,000 data rows, 200 columns. Row numbers refer to data records, not physical lines. Numeric-looking counts use decimal/scientific notation; strings and formulas are never evaluated. Preview is bounded; extra cells of ragged rows are not included in column summaries.",
            inputSchema: InspectSchema,
            annotations: {
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false,
            },
        },
        async (input) => {
            try {
                const data = inspectCsv(input);
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
                    'Bearer realm="csv-inspector-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "csv-inspector-mcp",
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
