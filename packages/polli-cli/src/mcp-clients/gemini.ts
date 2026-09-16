import { existsSync } from "node:fs";
import { join } from "node:path";
import { commandExists } from "../harnesses/fs.js";
import { fileAdapter } from "./json-config.js";

export const geminiAdapter = fileAdapter({
    id: "gemini-cli",
    label: "Gemini CLI",
    description: "Gemini CLI — mcpServers in ~/.gemini/settings.json",
    configPath: (ctx) => join(ctx.home, ".gemini", "settings.json"),
    container: ["mcpServers"],
    detect: (ctx) =>
        existsSync(join(ctx.home, ".gemini", "settings.json")) ||
        commandExists("gemini", ctx.env),
    buildEntry: (server, key) => ({
        httpUrl: server.url,
        headers: { Authorization: `Bearer ${key}` },
    }),
});
