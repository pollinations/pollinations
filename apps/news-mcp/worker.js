import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { earthquakeTools } from "./tools/earthquakes.js";
import { feeds } from "./tools/feeds.js";
import { hackernews } from "./tools/hackernews.js";
import { onThisDayTools } from "./tools/onthisday.js";
import { wayback } from "./tools/wayback.js";

const handler = createMcpHandler(
    () => {
        const server = new McpServer(
            { name: "news-mcp", version: "0.1.0" },
            { capabilities: { tools: {} } },
        );
        for (const [name, description, inputSchema, run] of [
            ...hackernews,
            ...feeds,
            ...wayback,
            ...earthquakeTools,
            ...onThisDayTools,
        ]) {
            server.registerTool(
                name,
                {
                    description,
                    inputSchema,
                    annotations: { readOnlyHint: true, openWorldHint: true },
                },
                async (args) => {
                    const text = JSON.stringify(await run(args));
                    if (new TextEncoder().encode(text).length > 512 * 1024)
                        throw new Error(
                            "Result exceeds 512 KiB; narrow the query. No partial result returned.",
                        );
                    return { content: [{ type: "text", text }] };
                },
            );
        }
        return server;
    },
    { legacy: "stateless" },
);

export default {
    fetch(request) {
        const { pathname } = new URL(request.url);
        if (pathname !== "/") return new Response("Not found", { status: 404 });
        // Private service binding only. Gen authenticates and applies quotas.
        return handler.fetch(request);
    },
};
