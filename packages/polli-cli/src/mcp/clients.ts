import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { commandExists, readTextIfExists } from "../harnesses/fs.js";
import { BASE_URL } from "../lib/config.js";
import type { McpServer } from "./catalog.js";
import {
    firstOwnedKey,
    isOwnedEntry,
    type JsonObject,
    ownedEntryNames,
    readEnvValue,
    readJsonObject,
    upsertEnvFile,
    writeJsonObject,
} from "./config-files.js";

export interface McpContext {
    /** Home directory client configs are resolved against. */
    home: string;
    env: NodeJS.ProcessEnv;
}

export interface McpClientResult {
    client: string;
    label: string;
    /** Server ids configured after the operation. */
    installed: string[];
    removed?: string[];
    files: string[];
    notes: string[];
}

/** One MCP-capable client. Each adapter owns its wiring strategy. */
export interface McpClientAdapter {
    id: string;
    label: string;
    /**
     * A Pollinations key already embedded in this client's config, if one can
     * be read back. Passed to `resolveHarnessKey` so re-installing reuses a
     * still-valid key instead of minting a new one on every run.
     */
    existingKey(ctx: McpContext): string | null;
    install(
        ctx: McpContext,
        servers: McpServer[],
        key: string,
    ): Promise<McpClientResult> | McpClientResult;
    remove(
        ctx: McpContext,
        serverIds?: string[],
    ): Promise<McpClientResult> | McpClientResult;
    status(ctx: McpContext): { installed: string[] };
    /** Fail fast before any key is minted (e.g. missing client CLI). */
    preflight?(ctx: McpContext): void;
}

const bearerHeader = (key: string) => ({
    Authorization: `Bearer ${key}`,
});

// ---------------------------------------------------------------------------
// JSON config file clients
// ---------------------------------------------------------------------------

interface JsonTarget {
    /** Config file path relative to ctx.home. */
    file: (ctx: McpContext) => string;
    /** Top-level table holding the server entries. */
    table: string;
    /** Build the entry for one server. */
    entry: (server: McpServer, key: string) => JsonObject;
    /** Extra config to merge alongside entries (e.g. VS Code inputs). */
    prepare?: (config: JsonObject, key: string) => void;
    /** Post-install hints shown to the user. */
    notes?: (key: string) => string[];
}

const jsonClient = (adapter: {
    id: string;
    label: string;
    target: JsonTarget;
}): McpClientAdapter => {
    const { id, label, target } = adapter;

    const readTable = (ctx: McpContext): JsonObject => {
        const existing = readJsonObject(target.file(ctx))[target.table];
        return existing && typeof existing === "object"
            ? (existing as JsonObject)
            : {};
    };

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
        existingKey: (ctx) => firstOwnedKey(readTable(ctx)),
        install: (ctx, servers, key) => {
            const kept: string[] = [];
            const { installed, file } = update(ctx, (config, table) => {
                for (const server of servers) {
                    if (server.id in table && !isOwnedEntry(table[server.id])) {
                        kept.push(server.id);
                        continue;
                    }
                    table[server.id] = target.entry(server, key);
                }
                target.prepare?.(config, key);
                return [];
            });
            return {
                client: id,
                label,
                installed,
                files: [file],
                notes: [
                    ...kept.map(
                        (name) =>
                            `Kept your existing non-Pollinations "${name}" entry; it was not overwritten.`,
                    ),
                    ...(target.notes?.(key) ?? []),
                ],
            };
        },
        remove: (ctx, serverIds) => {
            const { installed, removed, file } = update(
                ctx,
                (_config, table) => {
                    const names = serverIds?.length
                        ? serverIds.filter((name) => isOwnedEntry(table[name]))
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
        status: (ctx) => ({ installed: ownedEntryNames(readTable(ctx)) }),
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

const jsonClients: McpClientAdapter[] = [
    jsonClient({
        id: "cursor",
        label: "Cursor",
        target: {
            file: (ctx) => join(ctx.home, ".cursor", "mcp.json"),
            table: "mcpServers",
            entry: urlEntry,
        },
    }),
    jsonClient({
        id: "opencode",
        label: "OpenCode",
        target: {
            file: (ctx) =>
                join(
                    ctx.env.XDG_CONFIG_HOME ?? join(ctx.home, ".config"),
                    "opencode",
                    "opencode.json",
                ),
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
        target: {
            file: (ctx) =>
                join(ctx.home, ".codeium", "windsurf", "mcp_config.json"),
            table: "mcpServers",
            entry: (server, key) => ({
                serverUrl: server.url,
                headers: bearerHeader(key),
            }),
        },
    }),
    jsonClient({
        id: "cline",
        label: "Cline",
        target: {
            file: (ctx) => join(ctx.home, ".cline", "mcp.json"),
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
        target: {
            file: (ctx) => join(ctx.home, ".kiro", "settings", "mcp.json"),
            table: "mcpServers",
            entry: urlEntry,
        },
    }),
    jsonClient({
        id: "warp",
        label: "Warp",
        target: {
            file: (ctx) => join(ctx.home, ".warp", ".mcp.json"),
            table: "mcpServers",
            entry: urlEntry,
            notes: () => [
                "Warp: enable the servers under Settings > Agents > MCP servers if they don't auto-start.",
            ],
        },
    }),
    jsonClient({
        id: "vscode",
        label: "VS Code",
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
                        (input) =>
                            input &&
                            typeof input === "object" &&
                            input.id === VSCODE_INPUT_ID,
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
                `VS Code stores the key in its secret storage, not the config file: paste ${key} when it prompts for "Pollinations API key" on first connect.`,
            ],
        },
    }),
    jsonClient({
        id: "zed",
        label: "Zed",
        target: {
            file: (ctx) =>
                join(
                    ctx.env.XDG_CONFIG_HOME ?? join(ctx.home, ".config"),
                    "zed",
                    "settings.json",
                ),
            table: "context_servers",
            entry: (server, key) => ({
                command: {
                    path: "npx",
                    args: [
                        "-y",
                        "mcp-remote@latest",
                        server.url,
                        "--header",
                        `Authorization: Bearer ${key}`,
                    ],
                },
            }),
            notes: () => [
                "Zed requires the mcp-remote bridge for authenticated HTTP servers; npx and node must be installed.",
            ],
        },
    }),
];

// ---------------------------------------------------------------------------
// Clients configured through their own `mcp add` CLI
// ---------------------------------------------------------------------------

interface CliTarget {
    command: string;
    /** Arguments to add one server. */
    addArgs: (server: McpServer, key: string) => string[];
    /** Arguments to remove one server. */
    removeArgs: (serverId: string) => string[];
    /** Fallback install hint when the client's CLI is missing. */
    installHint: string;
    /** Read installed Pollinations-owned server ids from the client's config. */
    installedIds: (ctx: McpContext) => string[];
    /** Read a Pollinations key already stored in the client's config, if any. */
    existingKey: (ctx: McpContext) => string | null;
    /** Extra wiring after a successful add (e.g. Codex env file). */
    afterAdd?: (
        ctx: McpContext,
        key: string,
    ) => { files: string[]; notes: string[] };
    /** Extra notes. */
    notes?: () => string[];
}

const run = (command: string, args: string[]) => {
    const result = spawnSync(command, args, {
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
    target: CliTarget;
}): McpClientAdapter => {
    const { id, label, target } = adapter;

    const ensureCli = () => {
        if (!commandExists(target.command, process.env)) {
            throw new Error(
                `${label} CLI "${target.command}" was not found on PATH. ${target.installHint}`,
            );
        }
    };

    return {
        id,
        label,
        existingKey: target.existingKey,
        preflight: ensureCli,
        install: (ctx, servers, key) => {
            ensureCli();
            const files: string[] = [];
            const notes: string[] = target.notes?.() ?? [];
            for (const server of servers) {
                run(target.command, target.addArgs(server, key));
            }
            const extra = target.afterAdd?.(ctx, key);
            if (extra) {
                files.push(...extra.files);
                notes.push(...extra.notes);
            }
            return {
                client: id,
                label,
                installed: target.installedIds(ctx),
                files,
                notes,
            };
        },
        remove: (ctx, serverIds) => {
            ensureCli();
            const owned = target.installedIds(ctx);
            const names = serverIds?.length
                ? serverIds.filter((name) => owned.includes(name))
                : owned;
            for (const name of names) {
                run(target.command, target.removeArgs(name));
            }
            return {
                client: id,
                label,
                installed: target.installedIds(ctx),
                removed: names,
                files: [],
                notes: [],
            };
        },
        status: (ctx) => ({ installed: target.installedIds(ctx) }),
    };
};

const jsonTable = (
    file: (ctx: McpContext) => string,
    table: string,
    nested?: string,
) => {
    const read = (ctx: McpContext): unknown => {
        const config = readJsonObject(file(ctx));
        return nested
            ? config[nested] &&
                  typeof config[nested] === "object" &&
                  (config[nested] as JsonObject)[table]
            : config[table];
    };
    return {
        installedIds: (ctx: McpContext) => ownedEntryNames(read(ctx)),
        existingKey: (ctx: McpContext) => firstOwnedKey(read(ctx)),
    };
};

const codexConfigToml = (ctx: McpContext) =>
    join(ctx.env.CODEX_HOME ?? join(ctx.home, ".codex"), "config.toml");

const codexEnvFile = (ctx: McpContext) =>
    join(ctx.env.CODEX_HOME ?? join(ctx.home, ".codex"), ".env");

/** Parse [mcp_servers.<id>] sections from Codex's config.toml. */
export const codexInstalledIds = (toml: string, baseUrl = BASE_URL) => {
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

const CODEX_KEY_ENV = "POLLI_MCP_CODEX_API_KEY";

const httpAddArgs = (server: McpServer, key: string) => [
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
];

const cliClients: McpClientAdapter[] = [
    cliClient({
        id: "claude-code",
        label: "Claude Code",
        target: {
            command: "claude",
            addArgs: httpAddArgs,
            removeArgs: (serverId) => [
                "mcp",
                "remove",
                "--scope",
                "user",
                serverId,
            ],
            installHint: "Install it from https://claude.com/claude-code.",
            ...jsonTable((ctx) => join(ctx.home, ".claude.json"), "mcpServers"),
        },
    }),
    cliClient({
        id: "codex",
        label: "Codex CLI",
        target: {
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
            installHint: "Install it from https://github.com/openai/codex.",
            installedIds: (ctx) =>
                codexInstalledIds(readTextIfExists(codexConfigToml(ctx)) ?? ""),
            existingKey: (ctx) =>
                readEnvValue(codexEnvFile(ctx), CODEX_KEY_ENV),
            afterAdd: (ctx, key) => {
                const envFile = codexEnvFile(ctx);
                upsertEnvFile(envFile, { [CODEX_KEY_ENV]: key });
                return {
                    files: [envFile],
                    notes: [
                        `Codex reads ${CODEX_KEY_ENV} from ${envFile}; export it in your shell if you run Codex elsewhere.`,
                    ],
                };
            },
        },
    }),
    cliClient({
        id: "gemini",
        label: "Gemini CLI",
        target: {
            command: "gemini",
            addArgs: httpAddArgs,
            removeArgs: (serverId) => ["mcp", "remove", serverId],
            installHint:
                "Install it from https://github.com/google-gemini/gemini-cli.",
            ...jsonTable(
                (ctx) => join(ctx.home, ".gemini", "settings.json"),
                "mcpServers",
            ),
        },
    }),
    cliClient({
        id: "amp",
        label: "Amp",
        target: {
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
            installHint: "Install it from https://ampcode.com.",
            ...jsonTable(
                (ctx) =>
                    join(
                        ctx.env.XDG_CONFIG_HOME ?? join(ctx.home, ".config"),
                        "amp",
                        "settings.json",
                    ),
                "mcpServers",
                "amp",
            ),
        },
    }),
];

// Exported table matches the issue's priority list:
// claude-code, codex, vscode, cursor, opencode, gemini, copilot, windsurf,
// cline, amp, kiro, zed, warp.
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
];

const ALL = [...cliClients, ...jsonClients];

export const MCP_CLIENTS: McpClientAdapter[] = PRIORITY.map(
    (id) => ALL.find((client) => client.id === id) as McpClientAdapter,
);

export const findClient = (id: string): McpClientAdapter | undefined =>
    MCP_CLIENTS.find((client) => client.id === id);
