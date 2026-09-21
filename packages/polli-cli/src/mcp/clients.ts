import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { commandExists, readTextIfExists } from "../harnesses/fs.js";
import { opencodeConfigFile } from "../harnesses/opencode.js";
import { BASE_URL } from "../lib/config.js";
import type { McpServer } from "./catalog.js";
import {
    isOwnedEntry,
    type JsonObject,
    ownedEntryNames,
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
    description: string;
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
    /**
     * Recover the Pollinations key this adapter previously wrote into the
     * client's config, so a re-install reuses it instead of minting an
     * orphan. Null when no key was written yet.
     */
    existingKey?(ctx: McpContext): string | null;
    /** Fail fast before any key is minted (e.g. missing client CLI). */
    preflight?(ctx: McpContext): void;
}

const bearerHeader = (key: string) => ({
    Authorization: `Bearer ${key}`,
});

/** Extract the key from a `Bearer <key>` string (header value or arg). */
const keyFromBearer = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const match =
        /^Authorization[:=]\s*Bearer\s+(\S+)$/.exec(value.trim()) ??
        /^Bearer\s+(\S+)$/.exec(value.trim());
    const key = match?.[1];
    // VS Code stores a `${input:...}` reference, not a literal key.
    if (!key || key.includes("${")) return null;
    return key;
};

/**
 * Find the key a previous install wrote into a client config: checks the
 * headers of Pollinations-owned entries and, for bridge-style entries (Zed),
 * their args. Only owned entries are read — a foreign key is never reused.
 */
export const recoverKeyFromTable = (
    table: unknown,
    baseUrl: string = BASE_URL,
): string | null => {
    if (!table || typeof table !== "object") return null;
    for (const value of Object.values(table as JsonObject)) {
        if (!isOwnedEntry(value, baseUrl)) continue;
        const entry = value as JsonObject;
        const headers = entry.headers;
        if (headers && typeof headers === "object") {
            for (const headerValue of Object.values(headers as JsonObject)) {
                const key = keyFromBearer(headerValue);
                if (key) return key;
            }
        }
        const args = Array.isArray(entry.args)
            ? entry.args
            : entry.command &&
                typeof entry.command === "object" &&
                Array.isArray((entry.command as JsonObject).args)
              ? ((entry.command as JsonObject).args as unknown[])
              : [];
        for (const arg of args) {
            const key = keyFromBearer(arg);
            if (key) return key;
        }
    }
    return null;
};

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
    /** Post-install hints shown to the user. */
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
            const skipped: string[] = [];
            const { installed, file } = update(ctx, (_config, table) => {
                for (const server of servers) {
                    const existing = table[server.id];
                    if (existing !== undefined && !isOwnedEntry(existing)) {
                        // Never clobber a non-Pollinations server that
                        // happens to share the id: the user keeps their
                        // own config, and we say what we kept.
                        skipped.push(server.id);
                        continue;
                    }
                    table[server.id] = target.entry(server, key);
                }
                return [];
            });
            return {
                client: id,
                label,
                installed,
                files: [file],
                notes: [
                    ...(target.notes?.(key) ?? []),
                    ...skipped.map(
                        (serverId) =>
                            `Kept existing non-Pollinations server "${serverId}" - not overwritten.`,
                    ),
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
        status: (ctx) => {
            const file = target.file(ctx);
            const config = readJsonObject(file);
            return { installed: ownedEntryNames(config[target.table]) };
        },
        existingKey: (ctx) => {
            const config = readJsonObject(target.file(ctx));
            return recoverKeyFromTable(config[target.table]);
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

const jsonClients: McpClientAdapter[] = [
    jsonClient({
        id: "cursor",
        label: "Cursor",
        description: "Cursor desktop app (~/.cursor/mcp.json)",
        target: {
            file: (ctx) => join(ctx.home, ".cursor", "mcp.json"),
            table: "mcpServers",
            entry: urlEntry,
        },
    }),
    jsonClient({
        id: "opencode",
        label: "OpenCode",
        description: "OpenCode (~/.config/opencode/opencode.json)",
        target: {
            file: opencodeConfigFile,
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
                serverUrl: server.url,
                headers: bearerHeader(key),
            }),
        },
    }),
    jsonClient({
        id: "cline",
        label: "Cline",
        description: "Cline CLI (~/.cline/mcp.json)",
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
        description: "Kiro user-level MCP (~/.kiro/settings/mcp.json)",
        target: {
            file: (ctx) => join(ctx.home, ".kiro", "settings", "mcp.json"),
            table: "mcpServers",
            entry: urlEntry,
        },
    }),
    jsonClient({
        id: "warp",
        label: "Warp",
        description: "Warp file-based MCP (~/.warp/.mcp.json)",
        target: {
            file: (ctx) => join(ctx.home, ".warp", ".mcp.json"),
            table: "mcpServers",
            entry: urlEntry,
            notes: () => [
                "Warp: enable the servers under Settings > Agents > MCP servers if they do not auto-start.",
            ],
        },
    }),
    jsonClient({
        id: "vscode",
        label: "VS Code",
        description: "VS Code user MCP profile (User/mcp.json)",
        target: {
            file: (ctx) => join(vscodeUserDir(ctx), "mcp.json"),
            table: "servers",
            entry: (server, key) => ({
                type: "http",
                ...urlEntry(server, key),
            }),
        },
    }),
    jsonClient({
        id: "zed",
        label: "Zed",
        description: "Zed (native HTTP context_servers)",
        target: {
            file: (ctx) =>
                join(
                    ctx.env.XDG_CONFIG_HOME ?? join(ctx.home, ".config"),
                    "zed",
                    "settings.json",
                ),
            table: "context_servers",
            entry: urlEntry,
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
    configuredIds: (ctx: McpContext) => string[];
    /** Recover the key a previous install wrote (config headers or env file). */
    recoverKey?: (ctx: McpContext) => string | null;
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
    description: string;
    target: CliTarget;
}): McpClientAdapter => {
    const { id, label, description, target } = adapter;

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
        description,
        preflight: ensureCli,
        install: (ctx, servers, key) => {
            ensureCli();
            const files: string[] = [];
            const notes: string[] = target.notes?.() ?? [];
            const owned = target.installedIds(ctx);
            const configured = target.configuredIds(ctx);
            for (const server of servers) {
                if (
                    configured.includes(server.id) &&
                    !owned.includes(server.id)
                ) {
                    notes.push(
                        `Kept existing non-Pollinations server "${server.id}" - not overwritten.`,
                    );
                    continue;
                }
                if (owned.includes(server.id)) {
                    run(target.command, target.removeArgs(server.id));
                }
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
        existingKey: (ctx) => target.recoverKey?.(ctx) ?? null,
    };
};

const jsonTableIds =
    (file: (ctx: McpContext) => string, table: string, ownedOnly = true) =>
    (ctx: McpContext): string[] => {
        const config = readJsonObject(file(ctx));
        return ownedOnly
            ? ownedEntryNames(config[table])
            : Object.keys((config[table] ?? {}) as JsonObject);
    };

const codexConfigToml = (ctx: McpContext) =>
    join(ctx.env.CODEX_HOME ?? join(ctx.home, ".codex"), "config.toml");

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

const cliClients: McpClientAdapter[] = [
    cliClient({
        id: "claude-code",
        label: "Claude Code",
        description: "Claude Code (claude mcp add, user scope)",
        target: {
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
            installHint: "Install it from https://claude.com/claude-code.",
            installedIds: jsonTableIds(
                (ctx) => join(ctx.home, ".claude.json"),
                "mcpServers",
            ),
            configuredIds: jsonTableIds(
                (ctx) => join(ctx.home, ".claude.json"),
                "mcpServers",
                false,
            ),
            recoverKey: (ctx) =>
                recoverKeyFromTable(
                    readJsonObject(join(ctx.home, ".claude.json")).mcpServers,
                ),
        },
    }),
    cliClient({
        id: "codex",
        label: "Codex CLI",
        description:
            "Codex CLI (codex mcp add with bearer_token_env_var; the key lands in ~/.codex/.env)",
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
            configuredIds: (ctx) =>
                Array.from(
                    (readTextIfExists(codexConfigToml(ctx)) ?? "").matchAll(
                        /^\s*\[mcp_servers\.([^\]]+)\]\s*$/gm,
                    ),
                    (match) => match[1].replaceAll('"', ""),
                ),
            recoverKey: (ctx) => {
                const envFile = join(
                    ctx.env.CODEX_HOME ?? join(ctx.home, ".codex"),
                    ".env",
                );
                const line = (readTextIfExists(envFile) ?? "")
                    .split("\n")
                    .find((l) => new RegExp(`^${CODEX_KEY_ENV}\\s*=`).test(l));
                return line?.split("=").slice(1).join("=").trim() || null;
            },
            afterAdd: (ctx, key) => {
                const envFile = join(
                    ctx.env.CODEX_HOME ?? join(ctx.home, ".codex"),
                    ".env",
                );
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
        description: "Gemini CLI (gemini mcp add, user scope)",
        target: {
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
            removeArgs: (serverId) => [
                "mcp",
                "remove",
                "--scope",
                "user",
                serverId,
            ],
            installHint:
                "Install it from https://github.com/google-gemini/gemini-cli.",
            configuredIds: jsonTableIds(
                (ctx) => join(ctx.home, ".gemini", "settings.json"),
                "mcpServers",
                false,
            ),
            installedIds: jsonTableIds(
                (ctx) => join(ctx.home, ".gemini", "settings.json"),
                "mcpServers",
            ),
            recoverKey: (ctx) =>
                recoverKeyFromTable(
                    readJsonObject(join(ctx.home, ".gemini", "settings.json"))
                        .mcpServers,
                ),
        },
    }),
    cliClient({
        id: "amp",
        label: "Amp",
        description: "Amp (amp mcp add)",
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
            installedIds: jsonTableIds(
                (ctx) =>
                    join(
                        ctx.env.XDG_CONFIG_HOME ?? join(ctx.home, ".config"),
                        "amp",
                        "settings.json",
                    ),
                "amp.mcpServers",
            ),
            configuredIds: jsonTableIds(
                (ctx) =>
                    join(
                        ctx.env.XDG_CONFIG_HOME ?? join(ctx.home, ".config"),
                        "amp",
                        "settings.json",
                    ),
                "amp.mcpServers",
                false,
            ),
            recoverKey: (ctx) => {
                const config = readJsonObject(
                    join(
                        ctx.env.XDG_CONFIG_HOME ?? join(ctx.home, ".config"),
                        "amp",
                        "settings.json",
                    ),
                );
                return recoverKeyFromTable(config["amp.mcpServers"]);
            },
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

const byId = new Map(
    [...cliClients, ...jsonClients].map((client) => [client.id, client]),
);

export const MCP_CLIENTS: McpClientAdapter[] = PRIORITY.flatMap((id) => {
    const client = byId.get(id);
    return client ? [client] : [];
});

export const findClient = (id: string): McpClientAdapter | undefined =>
    MCP_CLIENTS.find((client) => client.id === id);
