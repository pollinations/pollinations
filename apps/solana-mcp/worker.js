import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { solanaTools } from "./tools/solana.js";

const handler = createMcpHandler(
    () => {
        const server = new McpServer(
            { name: "solana-mcp", title: "Solana Launch Radar", version: "0.1.0" },
            { capabilities: { tools: {} } },
        );
        for (const [name, description, inputSchema, run] of solanaTools) {
            server.registerTool(
                name,
                {
                    description,
                    inputSchema,
                    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
                },
                async (args) => {
                    const text = JSON.stringify(await run(args));
                    if (new TextEncoder().encode(text).length > 512 * 1024)
                        throw new Error("Result exceeds 512 KiB; narrow the query. No partial result returned.");
                    return { content: [{ type: "text", text }] };
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
        const pathname = new URL(request.url).pathname;
        if (pathname === "/health" && request.method === "GET")
            return Response.json({ status: "ok" });
        if (pathname !== "/") return new Response("Not found", { status: 404 });
        return handler.fetch(request);
    },
};
