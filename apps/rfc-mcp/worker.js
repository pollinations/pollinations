import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { rfcTools } from "./tools/rfc.js";

const handler = createMcpHandler(
    () => {
        const server = new McpServer(
            { name: "rfc-mcp", title: "IETF RFCs", version: "0.1.0" },
            { capabilities: { tools: {} } },
        );
        for (const [name, description, shape, run] of rfcTools) {
            server.registerTool(
                name,
                {
                    description,
                    inputSchema: z.object(shape),
                    annotations: {
                        readOnlyHint: true,
                        idempotentHint: true,
                        openWorldHint: true,
                    },
                },
                async (args) => {
                    const text = JSON.stringify(await run(args));
                    if (new TextEncoder().encode(text).length > 8 * 1024 * 1024)
                        throw new Error(
                            "Result exceeds 8 MiB; narrow the query. No partial result returned.",
                        );
                    return { content: [{ type: "text", text }] };
                },
            );
        }
        return server;
    },
    { legacy: "stateless" },
);

// Private binding only. Gen owns authentication, billing and batch rejection.
export default {
    fetch(request) {
        return new URL(request.url).pathname === "/"
            ? handler.fetch(request)
            : new Response("Not found", { status: 404 });
    },
};
