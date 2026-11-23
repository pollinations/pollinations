import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { cidrTools } from "./tools/cidr.js";
import { dnsTools } from "./tools/dns.js";
import { httpTools } from "./tools/http.js";
import { macTools } from "./tools/mac.js";
import { rdapTools } from "./tools/rdap.js";

const handler = createMcpHandler(
    () => {
        const server = new McpServer(
            { name: "network-mcp", title: "Network", version: "0.1.0" },
            { capabilities: { tools: {} } },
        );
        for (const [name, description, shape, run] of [
            ...dnsTools,
            ...httpTools,
            ...cidrTools,
            ...rdapTools,
            ...macTools,
        ]) {
            server.registerTool(
                name,
                {
                    description,
                    inputSchema: z.object(shape),
                    annotations: {
                        readOnlyHint: true,
                        openWorldHint: ![
                            "inspect_cidr",
                            "inspect_mac",
                        ].includes(name),
                    },
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

// Private service binding only; Gen owns authentication, rate limits and batch rejection.
export default {
    fetch(request) {
        if (new URL(request.url).pathname !== "/")
            return new Response("Not found", { status: 404 });
        return handler.fetch(request);
    },
};
