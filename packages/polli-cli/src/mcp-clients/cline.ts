import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolveHomePath } from "../harnesses/fs.js";
import { fileAdapter } from "./json-config.js";
import type { McpContext } from "./types.js";

const globalStorage = (ctx: McpContext): string => {
    if (process.platform === "win32") {
        return join(
            ctx.env.APPDATA ?? join(ctx.home, "AppData", "Roaming"),
            "Code",
            "User",
            "globalStorage",
        );
    }
    if (process.platform === "darwin") {
        return join(
            ctx.home,
            "Library",
            "Application Support",
            "Code",
            "User",
            "globalStorage",
        );
    }
    const xdg = ctx.env.XDG_CONFIG_HOME?.trim();
    return join(
        xdg ? resolveHomePath(ctx.home, xdg) : join(ctx.home, ".config"),
        "Code",
        "User",
        "globalStorage",
    );
};

const configPath = (ctx: McpContext) =>
    join(
        globalStorage(ctx),
        "saoudrizwan.claude-dev",
        "settings",
        "cline_mcp_settings.json",
    );

export const clineAdapter = fileAdapter({
    id: "cline",
    label: "Cline",
    description: "Cline VS Code extension — cline_mcp_settings.json",
    configPath,
    container: ["mcpServers"],
    buildEntry: (server, key) => ({
        type: "streamableHttp",
        url: server.url,
        headers: { Authorization: `Bearer ${key}` },
        disabled: false,
    }),
});
