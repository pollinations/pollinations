import { existsSync } from "node:fs";
import { join } from "node:path";
import { commandExists, resolveHomePath } from "../harnesses/fs.js";
import { fileAdapter } from "./json-config.js";
import type { McpContext } from "./types.js";

const configPath = (ctx: McpContext) => {
    const configured = ctx.env.CLAUDE_CONFIG_DIR?.trim();
    const home = configured ? resolveHomePath(ctx.home, configured) : ctx.home;
    return join(home, ".claude.json");
};

/** Claude Code stores user-scope MCP servers in ~/.claude.json. */
export const claudeCodeAdapter = fileAdapter({
    id: "claude-code",
    label: "Claude Code",
    description: "Claude Code CLI — user-scope servers in ~/.claude.json",
    configPath,
    container: ["mcpServers"],
    detect: (ctx) =>
        existsSync(configPath(ctx)) || commandExists("claude", ctx.env),
    buildEntry: (server, key) => ({
        type: "http",
        url: server.url,
        headers: { Authorization: `Bearer ${key}` },
    }),
});
