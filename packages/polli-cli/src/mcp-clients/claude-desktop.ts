import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileAdapter } from "./json-config.js";
import type { McpContext } from "./types.js";

/**
 * Claude Desktop only runs stdio servers, so each hosted endpoint is bridged
 * through the `mcp-remote` launcher — the one client where npx is allowed.
 */
const configPath = (ctx: McpContext): string => {
    if (process.platform === "darwin") {
        return join(
            ctx.home,
            "Library",
            "Application Support",
            "Claude",
            "claude_desktop_config.json",
        );
    }
    if (process.platform === "win32") {
        return join(
            ctx.env.APPDATA ?? join(ctx.home, "AppData", "Roaming"),
            "Claude",
            "claude_desktop_config.json",
        );
    }
    // No Linux build of Claude Desktop; keep a harmless fallback path.
    return join(ctx.home, ".config", "Claude", "claude_desktop_config.json");
};

export const claudeDesktopAdapter = fileAdapter({
    id: "claude-desktop",
    label: "Claude Desktop",
    description: "Claude Desktop app — hosted servers bridged via mcp-remote",
    configPath,
    container: ["mcpServers"],
    detect: (ctx) =>
        process.platform !== "linux" && existsSync(configPath(ctx)),
    buildEntry: (server, key) => ({
        command: "npx",
        args: [
            "-y",
            "mcp-remote",
            server.url,
            "--header",
            `Authorization: Bearer ${key}`,
        ],
    }),
});
