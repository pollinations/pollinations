import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolveHomePath } from "../harnesses/fs.js";
import { fileAdapter } from "./json-config.js";
import type { McpContext } from "./types.js";

const configPath = (ctx: McpContext) => {
    if (process.platform === "win32") {
        return join(
            ctx.env.APPDATA ?? join(ctx.home, "AppData", "Roaming"),
            "amp",
            "settings.json",
        );
    }
    const xdg = ctx.env.XDG_CONFIG_HOME?.trim();
    return join(
        xdg ? resolveHomePath(ctx.home, xdg) : join(ctx.home, ".config"),
        "amp",
        "settings.json",
    );
};

/**
 * Amp keeps servers under the flat top-level key "amp.mcpServers" in its
 * settings file (not nested), so the container path is that single key.
 */
export const ampAdapter = fileAdapter({
    id: "amp",
    label: "Amp",
    description: "Amp — amp.mcpServers in ~/.config/amp/settings.json",
    configPath,
    container: ["amp.mcpServers"],
    detect: (ctx) => existsSync(configPath(ctx)),
    buildEntry: (server, key) => ({
        url: server.url,
        headers: { Authorization: `Bearer ${key}` },
    }),
});
