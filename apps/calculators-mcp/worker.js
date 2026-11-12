import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { contrastTools } from "./tools/contrast.js";
import { currencyTools } from "./tools/currency.js";
import { diffTools } from "./tools/diff.js";
import { fractionTools } from "./tools/fraction.js";
import { hashTools } from "./tools/hash.js";
import { qrTools } from "./tools/qr.js";
import { statsTools } from "./tools/stats.js";
import { timeTools } from "./tools/time.js";
import { unicodeTools } from "./tools/unicode.js";
import { versionTools } from "./tools/versions.js";

const handler = createMcpHandler(
    () => {
        const server = new McpServer(
            { name: "calculators-mcp", title: "Calculators", version: "0.1.0" },
            { capabilities: { tools: {} } },
        );
        for (const [name, description, shape, run] of [
            ...timeTools,
            ...contrastTools,
            ...unicodeTools,
            ...qrTools,
            ...currencyTools,
            ...hashTools,
            ...statsTools,
            ...diffTools,
            ...fractionTools,
            ...versionTools,
        ]) {
            server.registerTool(
                name,
                {
                    description,
                    inputSchema: z.object(shape),
                    annotations: {
                        readOnlyHint: true,
                        openWorldHint: name.startsWith("currency_"),
                    },
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
