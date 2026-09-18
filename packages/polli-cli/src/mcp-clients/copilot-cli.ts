import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileAdapter } from "./json-config.js";

export const copilotCliAdapter = fileAdapter({
    id: "copilot-cli",
    label: "Copilot CLI",
    description:
        "GitHub Copilot CLI — mcpServers in ~/.copilot/mcp-config.json",
    configPath: (ctx) => join(ctx.home, ".copilot", "mcp-config.json"),
    container: ["mcpServers"],
    detect: (ctx) => existsSync(join(ctx.home, ".copilot")),
    buildEntry: (server, key) => ({
        type: "http",
        url: server.url,
        headers: { Authorization: `Bearer ${key}` },
    }),
});
