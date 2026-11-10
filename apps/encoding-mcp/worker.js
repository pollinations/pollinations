import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { bytesTools } from "./tools/bytes.js";
import { checksumTools } from "./tools/checksum.js";
import { hashTools } from "./tools/hash.js";
import { idTools } from "./tools/ids.js";
import { jwtTools } from "./tools/jwt.js";

const handler = createMcpHandler(
    () => {
        const server = new McpServer(
            { name: "encoding-mcp", title: "Encodings", version: "0.1.0" },
            { capabilities: { tools: {} } },
        );
        for (const [name, description, shape, run] of [
            ...bytesTools,
            ...hashTools,
            ...jwtTools,
            ...idTools,
            ...checksumTools,
        ]) {
            server.registerTool(
                name,
                {
                    description,
                    inputSchema: z.object(shape),
                    // Everything here is local arithmetic on the caller's input.
                    annotations: { readOnlyHint: true, openWorldHint: false },
                },
                async (args) => ({
                    content: [
                        { type: "text", text: JSON.stringify(await run(args)) },
                    ],
                }),
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
