import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileAdapter } from "./json-config.js";

export const zedAdapter = fileAdapter({
    id: "zed",
    label: "Zed",
    description: "Zed editor — context_servers in ~/.zed/settings.json",
    configPath: (ctx) => join(ctx.home, ".zed", "settings.json"),
    container: ["context_servers"],
    detect: (ctx) => existsSync(join(ctx.home, ".zed")),
    buildEntry: (server, key) => ({
        url: server.url,
        headers: { Authorization: `Bearer ${key}` },
    }),
});
