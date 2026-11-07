import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { weatherTools } from "./tools/weather.js";

const handler = createMcpHandler(
    () => {
        const server = new McpServer(
            { name: "weather-mcp", title: "Weather", version: "0.1.0" },
            { capabilities: { tools: {} } },
        );
        for (const [name, description, shape, run] of weatherTools) {
            server.registerTool(
                name,
                {
                    description,
                    inputSchema: z.object(shape),
                    annotations: { readOnlyHint: true, openWorldHint: true },
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

// Private service binding only. Gen owns authentication, quotas and batch rejection.
export default {
    fetch(request) {
        return new URL(request.url).pathname === "/"
            ? handler.fetch(request)
            : new Response("Not found", { status: 404 });
    },
};
