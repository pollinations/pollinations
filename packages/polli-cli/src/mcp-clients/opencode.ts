import { existsSync } from "node:fs";
import { join } from "node:path";
import { commandExists, resolveHomePath } from "../harnesses/fs.js";
import { fileAdapter } from "./json-config.js";
import type { McpContext } from "./types.js";

const candidates = (ctx: McpContext): string[] => {
    const configured = ctx.env.OPENCODE_CONFIG?.trim();
    if (configured) return [resolveHomePath(ctx.home, configured)];
    const configuredDir = ctx.env.OPENCODE_CONFIG_DIR?.trim();
    const dir = configuredDir
        ? resolveHomePath(ctx.home, configuredDir)
        : join(ctx.home, ".config", "opencode");
    return ["opencode.jsonc", "opencode.json", "config.json"].map((name) =>
        join(dir, name),
    );
};

const configPath = (ctx: McpContext): string =>
    candidates(ctx).find((path) => existsSync(path)) ?? candidates(ctx)[0];

export const opencodeAdapter = fileAdapter({
    id: "opencode",
    label: "OpenCode",
    description: 'OpenCode — remote servers under "mcp" in its config',
    configPath,
    container: ["mcp"],
    detect: (ctx) =>
        candidates(ctx).some((path) => existsSync(path)) ||
        commandExists("opencode", ctx.env),
    buildEntry: (server, key) => ({
        type: "remote",
        url: server.url,
        headers: { Authorization: `Bearer ${key}` },
        enabled: true,
    }),
});
