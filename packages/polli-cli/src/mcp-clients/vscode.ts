import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolveHomePath } from "../harnesses/fs.js";
import { entryName } from "./catalog.js";
import {
    containerAt,
    entriesIn,
    isPollinationsEntry,
    loadJsonish,
    saveJsonish,
} from "./json-config.js";
import type { McpClientAdapter, McpClientResult, McpContext } from "./types.js";

const ID = "vscode";
const LABEL = "VS Code";
/** The promptString input VS Code fills in when the server first connects. */
const INPUT_ID = "pollinations-mcp-key";

const configPath = (ctx: McpContext): string => {
    if (process.platform === "win32") {
        return join(
            ctx.env.APPDATA ?? join(ctx.home, "AppData", "Roaming"),
            "Code",
            "User",
            "mcp.json",
        );
    }
    if (process.platform === "darwin") {
        return join(
            ctx.home,
            "Library",
            "Application Support",
            "Code",
            "User",
            "mcp.json",
        );
    }
    const xdg = ctx.env.XDG_CONFIG_HOME?.trim();
    return join(
        xdg ? resolveHomePath(ctx.home, xdg) : join(ctx.home, ".config"),
        "Code",
        "User",
        "mcp.json",
    );
};

const record = (path: string, servers: string[]): McpClientResult => ({
    client: ID,
    label: LABEL,
    servers,
    files: existsSync(path) ? [path] : [],
    detected: existsSync(path),
});

const usesInput = (data: Record<string, unknown>): boolean =>
    JSON.stringify(data).includes(`\${input:${INPUT_ID}}`);

const promptInput = {
    type: "promptString",
    id: INPUT_ID,
    description: "Pollinations API key (run `polli mcp install` to mint one)",
    password: true,
};

/**
 * VS Code never sees the raw key: servers reference a password-protected
 * `inputs` prompt, so VS Code asks the user once and stores it securely.
 */
export const vscodeAdapter: McpClientAdapter = {
    id: ID,
    label: LABEL,
    description: "VS Code / Copilot — user mcp.json with a key prompt input",
    detect: (ctx) => existsSync(configPath(ctx)),
    install: (ctx, servers) => {
        const path = configPath(ctx);
        const data = loadJsonish(path);
        const inputs = Array.isArray(data.inputs)
            ? (data.inputs as Record<string, unknown>[]).filter(
                  (input) => input?.id !== INPUT_ID,
              )
            : [];
        inputs.push(promptInput);
        data.inputs = inputs;
        const node = containerAt(data, ["servers"]);
        for (const server of servers) {
            node[entryName(server)] = {
                type: "http",
                url: server.url,
                headers: {
                    Authorization: `Bearer \${input:${INPUT_ID}}`,
                },
            };
        }
        saveJsonish(path, data);
        return record(
            path,
            servers.map((s) => s.id),
        );
    },
    remove: (ctx) => {
        const path = configPath(ctx);
        if (!existsSync(path)) return record(path, []);
        const data = loadJsonish(path);
        const entries = entriesIn(data, ["servers"]) ?? {};
        const removed: string[] = [];
        for (const name of Object.keys(entries)) {
            if (isPollinationsEntry(name, entries[name])) {
                delete entries[name];
                removed.push(name);
            }
        }
        if (removed.length && !usesInput(data)) {
            data.inputs = (
                Array.isArray(data.inputs)
                    ? (data.inputs as Record<string, unknown>[])
                    : []
            ).filter((input) => input?.id !== INPUT_ID);
            saveJsonish(path, data);
        }
        return record(path, removed);
    },
    status: (ctx) => {
        const path = configPath(ctx);
        const data = loadJsonish(path);
        const entries = entriesIn(data, ["servers"]) ?? {};
        const servers = Object.keys(entries).filter((name) =>
            isPollinationsEntry(name, entries[name]),
        );
        return record(path, servers);
    },
};
