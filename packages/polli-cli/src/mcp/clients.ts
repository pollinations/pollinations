import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseEnv } from "node:util";
import JSON5 from "json5";
import {
    commandExists,
    readTextIfExists,
    removeIfExists,
    resolveHomePath,
    writeTextAtomic,
} from "../harnesses/fs.js";
import { opencodeConfigFile } from "../harnesses/opencode.js";
import type { HarnessContext } from "../harnesses/types.js";
import type { McpServer } from "./catalog.js";
import { ownedServerId } from "./catalog.js";

type JsonObject = Record<string, unknown>;

/** One client's slice of an install run. */
export interface McpReport {
    client: string;
    label: string;
    servers: string[];
    files: string[];
    notes?: string[];
}

/** What an uninstall actually managed to take out. */
export interface McpRemoval {
    removed: string[];
    /** Our entries the client keeps in a format only its own CLI can edit. */
    leftover: string[];
}

/** How a client stores the servers inside its JSON config. */
interface JsonFormat {
    /** Top-level key holding the map of servers, e.g. `mcpServers`. */
    key: string;
    entry: (server: McpServer, secret: string) => JsonObject;
    /** Client that asks for the secret through a prompt (VS Code `inputs`). */
    input?: { id: string; description: string };
}

/** The client's own `mcp add` command, preferred whenever it is on PATH. */
interface CliFormat {
    bin: string;
    add: (server: McpServer, secret: string) => string[];
    remove: (id: string) => string[];
}

export interface McpClient {
    id: string;
    label: string;
    description: string;
    restartHint: string;
    /** Client (or one of its config files) exists on this machine. */
    detect: (ctx: HarnessContext) => boolean;
    /** Config files the client reads; the first one that exists wins. */
    configPaths: (ctx: HarnessContext) => string[];
    /** Where to write when none of the candidates exists yet. */
    create?: (ctx: HarnessContext) => string;
    json?: JsonFormat;
    cli?: CliFormat;
    /** Polli-owned env file for clients that keep the key out of their config. */
    secretFile?: (ctx: HarnessContext) => string;
    /** Steps the CLI cannot do for the user. */
    notes?: (ctx: HarnessContext, secret?: string) => string[];
}

const isRecord = (value: unknown): value is JsonObject =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const bearer = (secret: string) => ({ Authorization: `Bearer ${secret}` });

const httpEntry = (server: McpServer, secret: string): JsonObject => ({
    url: server.url,
    headers: bearer(secret),
});

const typedEntry =
    (type: string) =>
    (server: McpServer, secret: string): JsonObject => ({
        type,
        url: server.url,
        headers: bearer(secret),
    });

const stringsDeep = (value: unknown): string[] => {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(stringsDeep);
    if (isRecord(value)) return Object.values(value).flatMap(stringsDeep);
    return [];
};

/** Server id of one client entry, decided by URL rather than by name. */
const ownedIdIn = (entry: unknown): string | null =>
    stringsDeep(entry)
        .map((value) => ownedServerId(value))
        .find((id) => id !== null) ?? null;

const homePath = (ctx: HarnessContext, ...segments: string[]) =>
    join(ctx.home, ...segments);

const configDir = (ctx: HarnessContext) => {
    const xdg = ctx.env.XDG_CONFIG_HOME?.trim();
    return xdg ? resolveHomePath(ctx.home, xdg) : homePath(ctx, ".config");
};

const appDataDir = (ctx: HarnessContext) => {
    const roaming = ctx.env.APPDATA?.trim();
    return roaming
        ? resolveHomePath(ctx.home, roaming)
        : homePath(ctx, "AppData", "Roaming");
};

const vscodeUserDir = (ctx: HarnessContext) => {
    if (process.platform === "darwin") {
        return homePath(ctx, "Library", "Application Support", "Code", "User");
    }
    if (process.platform === "win32") {
        return join(appDataDir(ctx), "Code", "User");
    }
    return join(configDir(ctx), "Code", "User");
};

const claudeCodeConfig = (ctx: HarnessContext) => {
    const configured = ctx.env.CLAUDE_CONFIG_DIR?.trim();
    return configured
        ? join(resolveHomePath(ctx.home, configured), ".claude.json")
        : homePath(ctx, ".claude.json");
};

const codexHome = (ctx: HarnessContext) => {
    const configured = ctx.env.CODEX_HOME?.trim();
    return configured
        ? resolveHomePath(ctx.home, configured)
        : homePath(ctx, ".codex");
};

const copilotHome = (ctx: HarnessContext) => {
    const configured = ctx.env.COPILOT_HOME?.trim();
    return configured
        ? resolveHomePath(ctx.home, configured)
        : homePath(ctx, ".copilot");
};

/** Zed reads `%APPDATA%\Zed\settings.json` on Windows, `~/.config` elsewhere. */
const zedSettings = (ctx: HarnessContext) => [
    ...(process.platform === "win32"
        ? [join(appDataDir(ctx), "Zed", "settings.json")]
        : []),
    join(configDir(ctx), "zed", "settings.json"),
];

const claudeDesktopConfig = (ctx: HarnessContext) => {
    if (process.platform === "darwin") {
        return homePath(
            ctx,
            "Library",
            "Application Support",
            "Claude",
            "claude_desktop_config.json",
        );
    }
    if (process.platform === "win32") {
        return join(appDataDir(ctx), "Claude", "claude_desktop_config.json");
    }
    return join(configDir(ctx), "Claude", "claude_desktop_config.json");
};

const clineSettings = (ctx: HarnessContext) => [
    join(
        vscodeUserDir(ctx),
        "globalStorage",
        "saoudrizwan.claude-dev",
        "settings",
        "cline_mcp_settings.json",
    ),
    homePath(ctx, ".cline", "mcp.json"),
];

/** Where a key lives when the client only ever sees its name. */
const secretPath = (ctx: HarnessContext, id: string) =>
    homePath(ctx, ".pollinations", "mcp", `${id}.env`);

const secretKey = (id: string) =>
    `POLLI_MCP_${id.toUpperCase().replace(/[^A-Z0-9]/gu, "_")}_API_KEY`;

const CODEX_KEY_ENV = secretKey("codex");

const VSCODE_INPUT_ID = "polli-mcp-key";

/**
 * Every client we can install into, in the order the quest lists them.
 * Entries carry no marker field: an entry is ours when one of its URLs is on
 * our host, which also keeps removal safe on configs we never wrote.
 */
export const MCP_CLIENTS: McpClient[] = [
    {
        id: "claude-code",
        label: "Claude Code",
        description: "Claude Code CLI, user scope in ~/.claude.json",
        restartHint:
            "Claude Code reads the servers on its next start; check them with /mcp.",
        detect: (ctx) =>
            commandExists("claude", ctx.env) ||
            existsSync(claudeCodeConfig(ctx)),
        configPaths: (ctx) => [claudeCodeConfig(ctx)],
        json: { key: "mcpServers", entry: typedEntry("http") },
        cli: {
            bin: "claude",
            add: (server, secret) => [
                "mcp",
                "add",
                "--scope",
                "user",
                "--transport",
                "http",
                server.id,
                server.url,
                "--header",
                `Authorization: Bearer ${secret}`,
            ],
            remove: (id) => ["mcp", "remove", "--scope", "user", id],
        },
    },
    {
        id: "codex",
        label: "Codex CLI",
        description: "Codex CLI, streamable HTTP in $CODEX_HOME/config.toml",
        restartHint:
            "Restart Codex, then run /mcp to see the Pollinations servers.",
        detect: (ctx) => commandExists("codex", ctx.env),
        configPaths: (ctx) => [join(codexHome(ctx), "config.toml")],
        cli: {
            bin: "codex",
            add: (server) => [
                "mcp",
                "add",
                server.id,
                "--url",
                server.url,
                "--bearer-token-env-var",
                CODEX_KEY_ENV,
            ],
            remove: (id) => ["mcp", "remove", id],
        },
        secretFile: (ctx) => secretPath(ctx, "codex"),
        notes: (ctx, secret) => [
            `Codex reads the bearer token from ${CODEX_KEY_ENV} instead of its config, so export it where Codex starts:`,
            secret
                ? `  export ${CODEX_KEY_ENV}=${secret}`
                : `  export ${CODEX_KEY_ENV}=<key from ${secretPath(ctx, "codex")}>`,
        ],
    },
    {
        id: "vscode",
        label: "VS Code / Copilot Chat",
        description:
            "VS Code user mcp.json, key kept in VS Code secret storage",
        restartHint:
            "Reload VS Code (Developer: Reload Window), then run MCP: List Servers.",
        detect: (ctx) => existsSync(vscodeUserDir(ctx)),
        configPaths: (ctx) => [join(vscodeUserDir(ctx), "mcp.json")],
        json: {
            key: "servers",
            entry: typedEntry("http"),
            input: {
                id: VSCODE_INPUT_ID,
                description: "Pollinations API key",
            },
        },
        secretFile: (ctx) => secretPath(ctx, "vscode"),
        notes: (ctx, secret) => [
            "VS Code asks for the key the first time it starts a Pollinations server and keeps it in secret storage.",
            secret ? `  key: ${secret}` : `  key: ${secretPath(ctx, "vscode")}`,
        ],
    },
    {
        id: "cursor",
        label: "Cursor",
        description: "MCP servers in ~/.cursor/mcp.json",
        restartHint: "Restart Cursor, then check Settings → MCP.",
        detect: (ctx) => existsSync(homePath(ctx, ".cursor")),
        configPaths: (ctx) => [homePath(ctx, ".cursor", "mcp.json")],
        json: { key: "mcpServers", entry: httpEntry },
    },
    {
        id: "opencode",
        label: "OpenCode",
        description: "Remote MCP servers in the OpenCode config",
        restartHint: "Restart OpenCode; its MCP panel lists the servers.",
        detect: (ctx) => existsSync(join(configDir(ctx), "opencode")),
        configPaths: (ctx) => [opencodeConfigFile(ctx)],
        json: {
            key: "mcp",
            entry: (server, secret) => ({
                type: "remote",
                url: server.url,
                headers: bearer(secret),
                enabled: true,
            }),
        },
        notes: () => [
            "For the first-party plugin (and a default model) run: polli harness opencode on",
        ],
    },
    {
        id: "gemini",
        label: "Gemini CLI",
        description: "Gemini CLI, user scope in ~/.gemini/settings.json",
        restartHint: "Restart Gemini CLI, then run /mcp.",
        detect: (ctx) => existsSync(homePath(ctx, ".gemini")),
        configPaths: (ctx) => [homePath(ctx, ".gemini", "settings.json")],
        json: {
            key: "mcpServers",
            entry: (server, secret) => ({
                httpUrl: server.url,
                headers: bearer(secret),
            }),
        },
        cli: {
            bin: "gemini",
            add: (server, secret) => [
                "mcp",
                "add",
                "--scope",
                "user",
                "--transport",
                "http",
                "--header",
                `Authorization: Bearer ${secret}`,
                server.id,
                server.url,
            ],
            remove: (id) => ["mcp", "remove", "--scope", "user", id],
        },
    },
    {
        id: "copilot-cli",
        label: "GitHub Copilot CLI",
        description: "MCP servers in $COPILOT_HOME/mcp-config.json",
        restartHint: "Restart Copilot CLI and run /mcp to list the servers.",
        detect: (ctx) => existsSync(copilotHome(ctx)),
        configPaths: (ctx) => [join(copilotHome(ctx), "mcp-config.json")],
        json: { key: "mcpServers", entry: typedEntry("http") },
    },
    {
        id: "windsurf",
        label: "Windsurf",
        description:
            "Remote MCP servers in ~/.codeium/windsurf/mcp_config.json",
        restartHint:
            "Restart Windsurf, then check Cascade → MCP servers. Remote servers use serverUrl.",
        detect: (ctx) => existsSync(homePath(ctx, ".codeium")),
        configPaths: (ctx) => [
            homePath(ctx, ".codeium", "windsurf", "mcp_config.json"),
        ],
        json: {
            key: "mcpServers",
            entry: (server, secret) => ({
                serverUrl: server.url,
                headers: bearer(secret),
            }),
        },
    },
    {
        id: "cline",
        label: "Cline",
        description: "MCP servers in the Cline CLI or VS Code extension config",
        restartHint:
            "Reload the Cline panel; the MCP Servers tab lists the new servers.",
        detect: (ctx) =>
            clineSettings(ctx).some((path) => existsSync(path)) ||
            existsSync(homePath(ctx, ".cline")),
        configPaths: clineSettings,
        create: (ctx) => homePath(ctx, ".cline", "mcp.json"),
        json: { key: "mcpServers", entry: typedEntry("streamableHttp") },
    },
    {
        id: "amp",
        label: "Amp",
        description: "MCP servers under amp.mcpServers in ~/.config/amp",
        restartHint: "Restart Amp; the servers appear in its MCP settings.",
        detect: (ctx) => existsSync(homePath(ctx, ".config", "amp")),
        configPaths: (ctx) => [
            homePath(ctx, ".config", "amp", "settings.json"),
            homePath(ctx, ".config", "amp", "settings.jsonc"),
        ],
        create: (ctx) => homePath(ctx, ".config", "amp", "settings.json"),
        json: { key: "amp.mcpServers", entry: httpEntry },
    },
    {
        id: "kiro",
        label: "Kiro",
        description: "MCP servers in ~/.kiro/settings/mcp.json",
        restartHint: "Restart Kiro, then check its MCP Servers panel.",
        detect: (ctx) => existsSync(homePath(ctx, ".kiro")),
        configPaths: (ctx) => [homePath(ctx, ".kiro", "settings", "mcp.json")],
        json: { key: "mcpServers", entry: httpEntry },
    },
    {
        id: "zed",
        label: "Zed",
        description: "Native remote servers in Zed's context_servers",
        restartHint:
            "Zed loads the servers immediately; its Agent panel shows them under MCP Servers.",
        detect: (ctx) =>
            zedSettings(ctx).some((path) => existsSync(path)) ||
            existsSync(join(configDir(ctx), "zed")),
        configPaths: zedSettings,
        json: { key: "context_servers", entry: httpEntry },
    },
    {
        id: "warp",
        label: "Warp",
        description: "MCP servers in ~/.warp/.mcp.json",
        restartHint:
            "Restart Warp, then check Settings → Agents → MCP servers.",
        detect: (ctx) => existsSync(homePath(ctx, ".warp")),
        configPaths: (ctx) => [homePath(ctx, ".warp", ".mcp.json")],
        json: { key: "mcpServers", entry: httpEntry },
    },
    {
        id: "claude-desktop",
        label: "Claude Desktop",
        description: "Claude Desktop config, bridged with mcp-remote",
        restartHint: "Quit and reopen Claude Desktop so it reloads its config.",
        detect: (ctx) => existsSync(dirname(claudeDesktopConfig(ctx))),
        configPaths: (ctx) => [claudeDesktopConfig(ctx)],
        json: {
            key: "mcpServers",
            entry: (server, secret) => ({
                command: "npx",
                args: [
                    "-y",
                    "mcp-remote",
                    server.url,
                    "--header",
                    `Authorization: Bearer ${secret}`,
                ],
            }),
        },
        notes: () => [
            "Claude Desktop cannot send headers, so the entry runs the mcp-remote bridge and needs npx on PATH.",
        ],
    },
];

export const findMcpClient = (id: string) =>
    MCP_CLIENTS.find((client) => client.id === id);

const readConfig = (path: string): JsonObject => {
    const text = readTextIfExists(path);
    if (text === null) return {};
    try {
        const parsed: unknown = JSON5.parse(text);
        if (isRecord(parsed)) return parsed;
    } catch (error) {
        throw new Error(`Could not parse ${path}`, { cause: error });
    }
    throw new Error(`${path} must contain a JSON object`);
};

/** Config writes carry the bearer key, so they stay owner-only like the key file. */
const writeConfig = (path: string, config: JsonObject) =>
    writeTextAtomic(path, `${JSON.stringify(config, null, 2)}\n`, 0o600);

/** Config file to use: the first that exists, else where we would create it. */
export const configFile = (ctx: HarnessContext, client: McpClient) => {
    const candidates = client.configPaths(ctx);
    return (
        candidates.find((path) => existsSync(path)) ??
        client.create?.(ctx) ??
        candidates[0]
    );
};

export const clientFiles = (ctx: HarnessContext, client: McpClient) => [
    configFile(ctx, client),
    ...(client.secretFile ? [client.secretFile(ctx)] : []),
];

const serversOf = (config: JsonObject, key: string): JsonObject =>
    isRecord(config[key]) ? (config[key] as JsonObject) : {};

const ownedIdsIn = (config: JsonObject, key: string) =>
    Object.values(serversOf(config, key))
        .map(ownedIdIn)
        .filter((id): id is string => id !== null);

/** `[mcp_servers.<name>]` sections of a Codex config.toml, with their URL. */
export const tomlServers = (text: string): { name: string; url: string }[] => {
    const servers: { name: string; url: string }[] = [];
    let current: { name: string; lines: string[] } | null = null;
    const flush = () => {
        if (!current) return;
        const url = /^\s*url\s*=\s*["']([^"']*)["']/mu.exec(
            current.lines.join("\n"),
        )?.[1];
        if (url !== undefined) servers.push({ name: current.name, url });
    };
    for (const line of text.split("\n")) {
        const header = /^\[mcp_servers\.(?:"([^"]+)"|([^"\]]+))\]/u.exec(
            line.trim(),
        );
        if (header) {
            flush();
            current = { name: header[1] ?? header[2], lines: [] };
            continue;
        }
        current?.lines.push(line);
    }
    flush();
    return servers;
};

/** Names of the config.toml sections that point at our host. */
export const tomlOwnedIds = (text: string): string[] =>
    tomlServers(text)
        .filter((server) => ownedServerId(server.url) !== null)
        .map((server) => server.name);

/** Server ids now configured in a client, whatever its config format. */
export const installedIds = (
    ctx: HarnessContext,
    client: McpClient,
): string[] => {
    const path = configFile(ctx, client);
    const text = readTextIfExists(path);
    if (text === null) return [];
    if (!client.json) return tomlOwnedIds(text);
    return ownedIdsIn(readConfig(path), client.json.key);
};

/** URL of one client entry, decided by ownership, for verify runs. */
const ownedUrlIn = (entry: unknown): string | null =>
    stringsDeep(entry).find((value) => ownedServerId(value) !== null) ?? null;

const bearerIn = (entry: unknown): string | null => {
    for (const value of stringsDeep(entry)) {
        const match = /^Bearer (.+)$/u.exec(value);
        if (match?.[1]?.trim()) return match[1].trim();
    }
    return null;
};

export interface InstalledEntry {
    id: string;
    url: string;
    /** Key the client sends, or null when the client prompts for one. */
    secret: string | null;
}

/**
 * Entries installed for one client together with the key that goes with them,
 * so a verify run can replay the handshake the client itself would make.
 */
export const installedEntries = (
    ctx: HarnessContext,
    client: McpClient,
): InstalledEntry[] => {
    const path = configFile(ctx, client);
    const text = readTextIfExists(path);
    if (text === null) return [];
    const file = client.secretFile?.(ctx);
    const stored = file ? readSecretFile(file, secretKey(client.id)) : null;
    if (!client.json) {
        return tomlServers(text)
            .filter((server) => ownedServerId(server.url) !== null)
            .map((server) => ({
                id: ownedServerId(server.url) ?? server.name,
                url: server.url,
                secret: stored,
            }));
    }
    const entries = serversOf(readConfig(path), client.json.key);
    const installed: InstalledEntry[] = [];
    for (const entry of Object.values(entries)) {
        const id = ownedIdIn(entry);
        const url = ownedUrlIn(entry);
        if (id === null || url === null) continue;
        installed.push({ id, url, secret: stored ?? bearerIn(entry) });
    }
    return installed;
};

const readSecretFile = (path: string, key: string): string | null => {
    const text = readTextIfExists(path);
    if (text === null) return null;
    return parseEnv(text)[key] || null;
};

/**
 * Key already configured for this client, so a re-install reuses it instead of
 * minting another child key for the same client.
 */
export const existingSecret = (
    ctx: HarnessContext,
    client: McpClient,
): string | null => {
    const file = client.secretFile?.(ctx);
    const stored = file ? readSecretFile(file, secretKey(client.id)) : null;
    if (stored) return stored;
    if (!client.json) return null;
    for (const entry of Object.values(
        serversOf(readConfig(configFile(ctx, client)), client.json.key),
    )) {
        if (ownedIdIn(entry) === null) continue;
        for (const value of stringsDeep(entry)) {
            const match = /^Bearer (.+)$/u.exec(value);
            if (match?.[1]?.trim()) return match[1].trim();
        }
    }
    return null;
};

const writeSecretFile = (
    ctx: HarnessContext,
    client: McpClient,
    secret: string,
) => {
    const file = client.secretFile?.(ctx);
    if (!file) return;
    const line = `${secretKey(client.id)}=${JSON.stringify(secret)}\n`;
    writeTextAtomic(file, line, 0o600);
};

const withInput = (
    existing: unknown,
    input: NonNullable<JsonFormat["input"]>,
) => {
    const list = Array.isArray(existing) ? existing : [];
    if (list.some((item) => isRecord(item) && item.id === input.id))
        return list;
    return [
        ...list,
        {
            type: "promptString",
            id: input.id,
            description: input.description,
            password: true,
        },
    ];
};

const withoutInput = (config: JsonObject, id: string) => {
    if (!Array.isArray(config.inputs)) return;
    const kept = config.inputs.filter(
        (item) => !(isRecord(item) && item.id === id),
    );
    if (kept.length === 0) delete config.inputs;
    else config.inputs = kept;
};

const installJson = (
    ctx: HarnessContext,
    client: McpClient,
    servers: McpServer[],
    secret: string,
): string[] => {
    const format = client.json as JsonFormat;
    const path = configFile(ctx, client);
    const config = readConfig(path);
    const entries = serversOf(config, format.key);
    // Clients that prompt for the secret reference the prompt, not the key.
    const value = format.input ? `\${input:${format.input.id}}` : secret;
    for (const server of servers) {
        entries[server.id] = format.entry(server, value);
    }
    config[format.key] = entries;
    if (format.input) config.inputs = withInput(config.inputs, format.input);
    writeConfig(path, config);
    return servers.map((server) => server.id);
};

const removeJson = (ctx: HarnessContext, client: McpClient): string[] => {
    const format = client.json as JsonFormat;
    const path = configFile(ctx, client);
    if (readTextIfExists(path) === null) return [];
    const config = readConfig(path);
    const entries = serversOf(config, format.key);
    const removed: string[] = [];
    for (const [name, entry] of Object.entries(entries)) {
        const id = ownedIdIn(entry);
        if (id === null) continue;
        delete entries[name];
        removed.push(id);
    }
    if (Object.keys(entries).length === 0) delete config[format.key];
    else config[format.key] = entries;
    if (format.input && removed.length > 0) {
        withoutInput(config, format.input.id);
    }
    writeConfig(path, config);
    return removed;
};

/** Windows runs the client through cmd, which splits arguments it can quote. */
const shellArg = (value: string) =>
    process.platform !== "win32" || !/[\s"]/u.test(value)
        ? value
        : `"${value.replace(/"/gu, '""')}"`;

const runCli = (ctx: HarnessContext, bin: string, args: string[]) => {
    const shell = process.platform === "win32";
    const result = spawnSync(
        shell ? [bin, ...args.map(shellArg)].join(" ") : bin,
        shell ? [] : args,
        { env: ctx.env, encoding: "utf-8", shell },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) {
        const detail = (result.stderr ?? "").trim();
        throw new Error(
            `${bin} ${args.slice(0, 2).join(" ")} failed: ${
                detail || `exit code ${result.status}`
            }`,
        );
    }
};

/**
 * Install servers into one client: its own `mcp add` command when that exists,
 * otherwise its config file. Keys are written next to the config for clients
 * that reference the secret by name rather than storing it.
 */
export const installClient = (
    ctx: HarnessContext,
    client: McpClient,
    servers: McpServer[],
    secret: string,
): string[] => {
    let installed: string[];
    if (client.cli && commandExists(client.cli.bin, ctx.env)) {
        for (const server of servers) {
            runCli(ctx, client.cli.bin, client.cli.add(server, secret));
        }
        installed = servers.map((server) => server.id);
    } else if (client.json) {
        installed = installJson(ctx, client, servers, secret);
    } else {
        throw new Error(
            `${client.label} was not found on PATH. Install ${client.label}, then re-run this command.`,
        );
    }
    writeSecretFile(ctx, client, secret);
    return installed;
};

/** Remove only the entries that point at our host; leave the rest alone. */
export const removeClient = (
    ctx: HarnessContext,
    client: McpClient,
): McpRemoval => {
    const before = installedIds(ctx, client);
    if (
        client.cli &&
        before.length > 0 &&
        commandExists(client.cli.bin, ctx.env)
    ) {
        for (const id of before) {
            runCli(ctx, client.cli.bin, client.cli.remove(id));
        }
    }
    const stripped = client.json ? removeJson(ctx, client) : [];
    const leftover = installedIds(ctx, client);
    const file = client.secretFile?.(ctx);
    // Keep the key while entries we could not remove still point at it.
    if (file && leftover.length === 0) removeIfExists(file);
    const removed = [...new Set([...before, ...stripped])].filter(
        (id) => !leftover.includes(id),
    );
    return { removed, leftover };
};

/** Status of one client: what is installed and which file says so. */
export const clientStatus = (
    ctx: HarnessContext,
    client: McpClient,
): McpReport => ({
    client: client.id,
    label: client.label,
    servers: installedIds(ctx, client),
    files: clientFiles(ctx, client),
    notes: client.notes?.(ctx),
});
