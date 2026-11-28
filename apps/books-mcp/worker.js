import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { bookTools } from "./tools/books.js";

const handler = () =>
    createMcpHandler(
        () => {
            const server = new McpServer({
                name: "books-mcp",
                title: "Books",
                version: "0.1.0",
            });
            for (const [name, description, schema, run] of bookTools) {
                server.registerTool(
                    name,
                    {
                        description,
                        inputSchema: z.object(schema),
                        annotations: {
                            readOnlyHint: true,
                            idempotentHint: true,
                            openWorldHint: true,
                        },
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

// Private service binding only. Gen owns caller auth, rate limits and batch rejection.
export default {
    fetch(request) {
        return new URL(request.url).pathname === "/"
            ? handler().fetch(request)
            : new Response("Not found", { status: 404 });
    },
};
