import { join } from "node:path";
import spawn from "cross-spawn";
import { commandExists } from "../harnesses/fs.js";
import { BASE_URL } from "../lib/config.js";
import type { McpServer } from "./catalog.js";
import {
    isOwnedEntry,
    type JsonObject,
    ownedEntryNames,
    readJsonObject,
    upsertEnvFile,
    writeJsonObject,
} from "./config.js";

export interface McpContext {
    home: string;
    env: NodeJS.ProcessEnv;
}

export interface McpClientResult {
    [key: string]: unknown;
    client: string;
    label: string;
    installed: string[];
    removed?: string[];
    files: string[];
    notes: string[];
}

export interface McpClientAdapter {
    id: string;
    label: string;
    description: string;
    install(
        ctx: McpContext,
        servers: McpServer[],
        key: string,
    ): McpClientResult;
    remove(ctx: McpContext, serverIds?: string[]): McpClientResult;
    status(ctx: McpContext): { installed: string[] };
    preflight?(ctx: McpContext): void;
}

const bearerHeader = (key: string) => ({
    Authorization: `Bearer ${key}`,
});

// ---------------------------------------------------------------------------
// JSON config file clients
// ---------------------------------------------------------------------------

interface JsonTarget {
    file: (ctx: McpContext) => string;
    table: string;
    entry: (server: McpServer, key: string) => JsonObject;
    prepare?: (config: JsonObject, key: string) => void;
    notes?: (key: string) => string[];
}

const jsonClient = (adapter: {
    id: string;
    label: string;
    description: string;
    target: JsonTarget;
}): McpClientAdapter => {
    const { id, label, description, target } = adapter;

    const update = (
        ctx: McpContext,
        mutate: (config: JsonObject, table: JsonObject) => string[],
    ): { installed: string[]; removed: string[]; file: string } => {
        const file = target.file(ctx);
        const config = readJsonObject(file);
        const existing = config[target.table];
        const table: JsonObject =
            existing && typeof existing === "object"
                ? (existing as JsonObject)
                : {};
        config[target.table] = table;
        const removed = mutate(config, table);
        if (Object.keys(table).length === 0) delete config[target.table];
        writeJsonObject(file, config);
        return { installed: ownedEntryNames(table), removed, file };
    };

    return {
        id,
        label,
        description,
        install: (ctx, servers, key) => {
            const { installed, file } = update(ctx, (_config, table) => {
                for (const server of servers) {
                    table[server.id] = target.entry(server, key);
                }
                target.prepare?.(_config, key);
                return [];
            });
            return {
                client: id,
                label,
                installed,
                files: [file],
                notes: target.notes?.(key) ?? [],
            };
        },
        remove: (ctx, serverIds) => {
            const { installed, removed, file } = update(
                ctx,
                (_config, table) => {
                    const names = serverIds?.length
                        ? serverIds.filter((n) => isOwnedEntry(table[n]))
                        : ownedEntryNames(table);
                    for (const name of names) delete table[name];
                    return names;
                },
            );
            return {
                client: id,
                label,
                installed,
                removed,
                files: [file],
                notes: [],
            };
        },
        status: (ctx) => {
            const file = target.file(ctx);
            const config = readJsonObject(file);
            return { installed: ownedEntryNames(config[target.table]) };
        },
    };
};

const urlEntry = (server: McpServer, key: string): JsonObject => ({
    url: server.url,
    headers: bearerHeader(key),
});

const vscodeUserDir = (ctx: McpContext): string => {
    if (process.platform === "win32") {
        return join(
            ctx.env.APPDATA ?? join(ctx.home, "AppData", "Roaming"),
            "Code",
            "User",
        );
    }
    if (process.platform === "darwin") {
        return join(ctx.home, "Library", "Application Support", "Code", "User");
    }
    return join(
        ctx.env.XDG_CONFIG_HOME ?? join(ctx.home, ".config"),
        "Code",
        "User",
    );
};

const VSCODE_INPUT_ID = "pollinations-mcp-key";

const xdgConfigHome = (ctx: McpContext) =>
    ctx.env.XDG_CONFIG_HOME ?? join(ctx.home, ".config");

const jsonClients: McpClientAdapter[] = [
    jsonClient({
        id: "cursor",
        label: "Cursor",
        description: "Cursor (~/.cursor/mcp.json)",
        target: {
            file: (ctx) => join(ctx.home, ".cursor", "mcp.json"),
            table: "mcpServers",
            entry: urlEntry,
        },
    }),
    jsonClient({
        id: "opencode",
        label: "OpenCode",
        description: "OpenCode (opencode.json)",
        target: {
            file: (ctx) =>
                join(xdgConfigHome(ctx), "opencode", "opencode.json"),
            table: "mcp",
            entry: (server, key) => ({
                type: "remote",
                url: server.url,
                headers: bearerHeader(key),
                enabled: true,
            }),
        },
    }),
    jsonClient({
        id: "copilot",
        label: "GitHub Copilot CLI",
        description: "Copilot CLI (~/.copilot/mcp-config.json)",
        target: {
            file: (ctx) => join(ctx.home, ".copilot", "mcp-config.json"),
            table: "mcpServers",
            entry: (server, key) => ({
                type: "http",
                url: server.url,
                headers: bearerHeader(key),
            }),
        },
    }),
    jsonClient({
        id: "windsurf",
        label: "Windsurf",
        description: "Windsurf (~/.codeium/windsurf/mcp_config.json)",
        target: {
            file: (ctx) =>
                join(ctx.home, ".codeium", "windsurf", "mcp_config.json"),
            table: "mcpServers",
            entry: (server, key) => ({
                url: server.url,
                headers: bearerHeader(key),
            }),
        },
    }),
    jsonClient({
        id: "cline",
        label: "Cline",
        description: "Cline (cline_mcp_settings.json)",
        target: {
            file: (ctx) =>
                join(
                    xdgConfigHome(ctx),
                    "Code",
                    "User",
                    "globalStorage",
                    "saoudrizwan.claude-dev",
                    "settings",
                    "cline_mcp_settings.json",
                ),
            table: "mcpServers",
            entry: (server, key) => ({
                type: "streamableHttp",
                url: server.url,
                headers: bearerHeader(key),
            }),
        },
    }),
    jsonClient({
        id: "kiro",
        label: "Kiro",
        description: "Kiro (~/.kiro/settings/mcp.json)",
        target: {
            file: (ctx) => join(ctx.home, ".kiro", "settings", "mcp.json"),
            table: "mcpServers",
            entry: urlEntry,
        },
    }),
    jsonClient({
        id: "zed",
        label: "Zed",
        description: "Zed (settings.json context_servers)",
        target: {
            file: (ctx) => join(xdgConfigHome(ctx), "zed", "settings.json"),
            table: "context_servers",
            entry: urlEntry,
        },
    }),
    jsonClient({
        id: "warp",
        label: "Warp",
        description: "Warp (~/.warp/.mcp.json)",
        target: {
            file: (ctx) => join(ctx.home, ".warp", ".mcp.json"),
            table: "mcpServers",
            entry: urlEntry,
        },
    }),
    jsonClient({
        id: "vscode",
        label: "VS Code",
        description: "VS Code (User/mcp.json)",
        target: {
            file: (ctx) => join(vscodeUserDir(ctx), "mcp.json"),
            table: "servers",
            entry: (server) => ({
                type: "http",
                url: server.url,
                headers: {
                    Authorization: `Bearer \${input:${VSCODE_INPUT_ID}}`,
                },
            }),
            prepare: (config) => {
                const inputs = Array.isArray(config.inputs)
                    ? (config.inputs as JsonObject[])
                    : [];
                if (
                    !inputs.some(
                        (i) =>
                            i &&
                            typeof i === "object" &&
                            i.id === VSCODE_INPUT_ID,
                    )
                ) {
                    inputs.push({
                        type: "promptString",
                        id: VSCODE_INPUT_ID,
                        description: "Pollinations API key",
                        password: true,
                    });
                }
                config.inputs = inputs;
            },
            notes: (key) => [
                `VS Code stores the key in secret storage. Paste ${key} when prompted for "Pollinations API key" on first connect.`,
            ],
        },
    }),
];

// ---------------------------------------------------------------------------
// CLI-based clients
// ---------------------------------------------------------------------------

const runCli = (command: string, args: string[]): void => {
    const result = spawn.sync(command, args, {
        stdio: ["ignore", "pipe", "pipe"],
        encoding: "utf-8",
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(
            `${command} ${args[0]} failed (${result.status}): ${result.stderr?.trim() || result.stdout?.trim() || "no output"}`,
        );
    }
};

const cliClient = (adapter: {
    id: string;
    label: string;
    description: string;
    command: string;
    addArgs: (server: McpServer, key: string) => string[];
    removeArgs: (serverId: string) => string[];
    installHint: string;
    installedIds: (ctx: McpContext) => string[];
    afterAdd?: (
        ctx: McpContext,
        key: string,
    ) => { files: string[]; notes: string[] };
}): McpClientAdapter => {
    const {
        id,
        label,
        description,
        command: cli,
        addArgs,
        removeArgs,
        installHint,
        installedIds,
        afterAdd,
    } = adapter;

    const ensureCli = () => {
        if (!commandExists(cli, process.env)) {
            throw new Error(`${label} CLI "${cli}" not found. ${installHint}`);
        }
    };

    return {
        id,
        label,
        description,
        preflight: ensureCli,
        install: (ctx, servers, key) => {
            ensureCli();
            const files: string[] = [];
            const notes: string[] = [];
            for (const server of servers) {
                runCli(cli, addArgs(server, key));
            }
            const extra = afterAdd?.(ctx, key);
            if (extra) {
                files.push(...extra.files);
                notes.push(...extra.notes);
            }
            return {
                client: id,
                label,
                installed: installedIds(ctx),
                files,
                notes,
            };
        },
        remove: (ctx, serverIds) => {
            ensureCli();
            const owned = installedIds(ctx);
            const names = serverIds?.length
                ? serverIds.filter((n) => owned.includes(n))
                : owned;
            for (const name of names) {
                runCli(cli, removeArgs(name));
            }
            return {
                client: id,
                label,
                installed: installedIds(ctx),
                removed: names,
                files: [],
                notes: [],
            };
        },
        status: (ctx) => ({ installed: installedIds(ctx) }),
    };
};

const jsonTableIds =
    (file: (ctx: McpContext) => string, table: string) =>
    (ctx: McpContext): string[] => {
        const config = readJsonObject(file(ctx));
        return ownedEntryNames(config[table]);
    };

const CODEX_KEY_ENV = "POLLI_MCP_CODEX_KEY";

const codexHome = (ctx: McpContext) =>
    ctx.env.CODEX_HOME ?? join(ctx.home, ".codex");

const codexConfigToml = (ctx: McpContext) =>
    join(codexHome(ctx), "config.toml");

export const codexInstalledIds = (
    toml: string,
    baseUrl: string = BASE_URL,
): string[] => {
    const ids: string[] = [];
    let current: string | null = null;
    for (const line of toml.split("\n")) {
        const section = /^\s*\[mcp_servers\.([^\]]+)\]\s*$/.exec(line);
        if (section) {
            current = section[1].replaceAll('"', "");
            continue;
        }
        if (/^\s*\[/.test(line)) {
            current = null;
            continue;
        }
        if (
            current &&
            /^\s*url\s*=/.test(line) &&
            line.includes(`${baseUrl}/mcp/`)
        ) {
            ids.push(current);
        }
    }
    return ids;
};

const cliClients: McpClientAdapter[] = [
    cliClient({
        id: "claude-code",
        label: "Claude Code",
        description: "Claude Code (claude mcp add)",
        command: "claude",
        addArgs: (server, key) => [
            "mcp",
            "add",
            "--scope",
            "user",
            "--transport",
            "http",
            server.id,
            server.url,
            "--header",
            `Authorization: Bearer ${key}`,
        ],
        removeArgs: (serverId) => [
            "mcp",
            "remove",
            "--scope",
            "user",
            serverId,
        ],
        installHint: "Install: https://claude.com/claude-code",
        installedIds: jsonTableIds(
            (ctx) => join(ctx.home, ".claude.json"),
            "mcpServers",
        ),
    }),
    cliClient({
        id: "codex",
        label: "Codex CLI",
        description: "Codex CLI (codex mcp add)",
        command: "codex",
        addArgs: (server) => [
            "mcp",
            "add",
            server.id,
            "--url",
            server.url,
            "--bearer-token-env-var",
            CODEX_KEY_ENV,
        ],
        removeArgs: (serverId) => ["mcp", "remove", serverId],
        installHint: "Install: https://github.com/openai/codex",
        installedIds: (ctx) =>
            codexInstalledIds(readFileSyncSafe(codexConfigToml(ctx))),
        afterAdd: (ctx, key) => {
            const envFile = join(codexHome(ctx), ".env");
            upsertEnvFile(envFile, { [CODEX_KEY_ENV]: key });
            return {
                files: [envFile],
                notes: [
                    `Codex reads ${CODEX_KEY_ENV} from ${envFile}. Export it in your shell if running Codex elsewhere.`,
                ],
            };
        },
    }),
    cliClient({
        id: "gemini",
        label: "Gemini CLI",
        description: "Gemini CLI (gemini mcp add)",
        command: "gemini",
        addArgs: (server, key) => [
            "mcp",
            "add",
            "--scope",
            "user",
            "--transport",
            "http",
            server.id,
            server.url,
            "--header",
            `Authorization: Bearer ${key}`,
        ],
        removeArgs: (serverId) => ["mcp", "remove", serverId],
        installHint: "Install: https://github.com/google-gemini/gemini-cli",
        installedIds: jsonTableIds(
            (ctx) => join(ctx.home, ".gemini", "settings.json"),
            "mcpServers",
        ),
    }),
    cliClient({
        id: "amp",
        label: "Amp",
        description: "Amp (amp mcp add)",
        command: "amp",
        addArgs: (server, key) => [
            "mcp",
            "add",
            server.id,
            server.url,
            "--header",
            `Authorization=Bearer ${key}`,
        ],
        removeArgs: (serverId) => ["mcp", "remove", serverId],
        installHint: "Install: https://ampcode.com",
        installedIds: (ctx) => {
            const config = readJsonObject(
                join(xdgConfigHome(ctx), "amp", "settings.json"),
            );
            const ampTable = config.amp;
            if (ampTable && typeof ampTable === "object") {
                return ownedEntryNames((ampTable as JsonObject).mcpServers);
            }
            return [];
        },
    }),
];

const PRIORITY = [
    "claude-code",
    "codex",
    "vscode",
    "cursor",
    "opencode",
    "gemini",
    "copilot",
    "windsurf",
    "cline",
    "amp",
    "kiro",
    "zed",
    "warp",
] as const;

const byId = new Map<string, McpClientAdapter>(
    [...cliClients, ...jsonClients].map((c) => [c.id, c]),
);

export const MCP_CLIENTS: McpClientAdapter[] = PRIORITY.flatMap((id) => {
    const client = byId.get(id);
    return client ? [client] : [];
});

export const findClient = (id: string): McpClientAdapter | undefined =>
    MCP_CLIENTS.find((c) => c.id === id);

import { readFileSync } from "node:fs";

const readFileSyncSafe = (path: string): string => {
    try {
        return readFileSync(path, "utf-8");
    } catch {
        return "";
    }
};
