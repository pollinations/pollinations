import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    ConversionSchema,
    convertUnits,
    QuantitySchema,
    UNITS,
} from "./units.js";

const result = (data) => ({
    content: [{ type: "text", text: JSON.stringify(data) }],
    structuredContent: data,
});

function buildServer() {
    const server = new McpServer(
        {
            name: "unit-conversion-mcp",
            title: "Unit Conversion MCP",
            version: "0.1.0",
        },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "list_units",
        {
            description:
                "List supported pressure, volume_flow, power and energy units with their SI factors. Unit identifiers are case-sensitive; US and imperial gallons and mechanical and metric horsepower are distinct.",
            inputSchema: z
                .object({ quantity: QuantitySchema.optional() })
                .strict(),
            annotations: {
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false,
            },
        },
        async ({ quantity }) =>
            result(quantity ? { [quantity]: UNITS[quantity] } : UNITS),
    );
    server.registerTool(
        "convert_units",
        {
            description:
                "Convert pressure, volumetric flow, power or energy using fixed SI factors, without model or network calls. Use list_units for identifiers. Returns converted = value * factor with IEEE-754 double precision; no significant-figure rounding. Pressure reference (gauge/absolute) is unchanged; fluid properties and electrical power factor are not inferred.",
            inputSchema: ConversionSchema,
            annotations: {
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false,
            },
        },
        async (input) => {
            try {
                return result(convertUnits(input));
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

const handler = createMcpHandler(buildServer, { legacy: "stateless" });

export default {
    async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "unit-conversion-mcp",
                transport: "streamable-http",
                endpoint: "/",
                stateless: true,
            });
        }
        if (url.pathname !== "/")
            return new Response("Not found", { status: 404 });
        const authorization = request.headers.get("authorization") ?? "";
        const token = /^Bearer\s+(\S+)\s*$/i.exec(authorization)?.[1];
        // Gen authenticates the caller; direct Worker access only checks bearer syntax.
        if (!token) {
            return Response.json(
                {
                    error: "unauthorized",
                    message: "Send a Pollinations API key as a bearer token.",
                },
                {
                    status: 401,
                    headers: {
                        "WWW-Authenticate":
                            'Bearer realm="unit-conversion-mcp.pollinations.ai"',
                    },
                },
            );
        }
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
        return handler.fetch(request, {
            authInfo: { token, clientId: "pollinations-api-key", scopes: [] },
        });
    },
};
