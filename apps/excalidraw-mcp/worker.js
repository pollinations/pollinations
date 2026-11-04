// Upstream's api/mcp.ts entry point for Workers. Reachable only through
// gen.pollinations.ai/mcp/excalidraw (service binding EXCALIDRAW_MCP), which
// authenticates the caller.
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { kvCheckpointStore } from "./checkpoint-store.ts";
import { MCP_APP_HTML } from "./mcp-app.js";
import { registerTools } from "./server.ts";

const handlerOptions = {
    legacy: "stateless",
    onerror: (error) => console.error(error),
};

export default {
    fetch(request, env) {
        const store = kvCheckpointStore(env.DIAGRAMS);
        const mcpHandler = createMcpHandler(() => {
            const server = new McpServer({
                name: "Excalidraw",
                version: "1.0.0",
            });
            registerTools(server, MCP_APP_HTML, store);
            return server;
        }, handlerOptions);
        return mcpHandler.fetch(request);
    },
};
