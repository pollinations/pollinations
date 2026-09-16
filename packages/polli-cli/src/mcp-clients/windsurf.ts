import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileAdapter } from "./json-config.js";

export const windsurfAdapter = fileAdapter({
    id: "windsurf",
    label: "Windsurf",
    description: "Windsurf editor — mcp_config.json under ~/.codeium",
    configPath: (ctx) =>
        join(ctx.home, ".codeium", "windsurf", "mcp_config.json"),
    container: ["mcpServers"],
    detect: (ctx) => existsSync(join(ctx.home, ".codeium", "windsurf")),
    buildEntry: (server, key) => ({
        serverUrl: server.url,
        headers: { Authorization: `Bearer ${key}` },
    }),
});
