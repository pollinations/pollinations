import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileAdapter } from "./json-config.js";

export const kiroAdapter = fileAdapter({
    id: "kiro",
    label: "Kiro",
    description: "Kiro IDE — MCP servers in ~/.kiro/settings/mcp.json",
    configPath: (ctx) => join(ctx.home, ".kiro", "settings", "mcp.json"),
    container: ["mcpServers"],
    detect: (ctx) => existsSync(join(ctx.home, ".kiro")),
    buildEntry: (server, key) => ({
        url: server.url,
        headers: { Authorization: `Bearer ${key}` },
        disabled: false,
    }),
});
