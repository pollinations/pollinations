import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { contrastTools } from "./tools/contrast.js";
import { qrTools } from "./tools/qr.js";
import { timeTools } from "./tools/time.js";
import { unicodeTools } from "./tools/unicode.js";

const handler = createMcpHandler(
    () => {
        const server = new McpServer(
            { name: "toolbox-mcp", title: "Toolbox", version: "0.1.0" },
            { capabilities: { tools: {} } },
        );
        for (const [name, description, shape, run] of [
            ...timeTools,
            ...contrastTools,
            ...unicodeTools,
            ...qrTools,
        ]) {
            server.registerTool(
                name,
                {
                    description,
                    inputSchema: z.object(shape),
                    annotations: { readOnlyHint: true, openWorldHint: false },
                },
                async (args) => {
                    const result = await run(args);
                    return {
                        content: [
                            {
                                type: "text",
                                text:
                                    typeof result === "string"
                                        ? result
                                        : JSON.stringify(result),
                            },
                        ],
                    };
                },
            );
        }
        return server;
    },
    { legacy: "stateless" },
);

// This is a private service-binding Worker; Gen owns authentication/rate limits.
export default {
    async fetch(request) {
        const path = new URL(request.url).pathname;
        if (path === "/health" && request.method === "GET") {
            return Response.json({
                name: "toolbox-mcp",
                endpoint: "/",
                stateless: true,
            });
        }
        if (path !== "/") return new Response("Not found", { status: 404 });
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
                { error: "MCP batch requests are not supported" },
                { status: 400 },
            );
        }
        return handler.fetch(request);
    },
};
