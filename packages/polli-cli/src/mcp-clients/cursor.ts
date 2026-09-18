import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileAdapter } from "./json-config.js";

export const cursorAdapter = fileAdapter({
    id: "cursor",
    label: "Cursor",
    description: "Cursor editor — MCP servers in ~/.cursor/mcp.json",
    configPath: (ctx) => join(ctx.home, ".cursor", "mcp.json"),
    container: ["mcpServers"],
    detect: (ctx) => existsSync(join(ctx.home, ".cursor")),
    buildEntry: (server, key) => ({
        url: server.url,
        headers: { Authorization: `Bearer ${key}` },
    }),
});
