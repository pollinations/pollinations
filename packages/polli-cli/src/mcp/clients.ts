import { join } from "node:path";
import {
    commandExists,
    readTextIfExists,
    resolveHomePath,
} from "../harnesses/fs.js";
import { opencodeConfigFile } from "../harnesses/opencode.js";
import type { McpServer } from "./catalog.js";
import {
    bearerFromEntry,
    isOwnedEntry,
    type JsonObject,
    mcpUrlPrefix,
    ownedEntryNames,
    readCodexServers,
    readEnvValue,
    readJsonFile,
    readNestedTable,
    readTable,
    removeEnvValue,
    runCli,
    writeEnvValue,
    writeJsonFile,
    writeTable,
} from "./config.js";
import type { McpClient, McpContext } from "./types.js";

/** Specs receive the complete header value, e.g. `Bearer sk_...`. */
const authHeader = (authorization: string) => ({
    Authorization: authorization,
});

/** Existing file wins, otherwise the first candidate is created. */
const targetPath = (candidates: string[]) =>
    candidates.find((path) => readTextIfExists(path) !== null) ??
    candidates[candidates.length - 1];

interface JsonClientSpec {
    id: string;
    label: string;
    description: string;
    restartHint: string;
    /** Config file candidates, most specific first. */
    paths(ctx: McpContext): string[];
    /** Top-level table holding the server map. */
    table: string;
    entry(server: McpServer, authorization: string): JsonObject;
    /** Header value for the key; clients that prompt for it reference an input. */
    authorization?(key: string): string;
    /** Set when the key is not stored in the config file. */
    promptInput?: { id: string; description: string };
    /** Hint printed when the key has to be entered by the user. */
    keyNote?: (key: string) => string;
}

const jsonClient = (spec: JsonClientSpec): McpClient => {
    const path = (ctx: McpContext) => targetPath(spec.paths(ctx));
    const load = (ctx: McpContext) => readJsonFile(path(ctx));
    const container = (ctx: McpContext) =>
        readTable(load(ctx).data, spec.table);

    return {
        id: spec.id,
        label: spec.label,
        description: spec.description,
        restartHint: spec.restartHint,
        available: () => true,
        configPaths: (ctx) => [path(ctx)],
        installed: (ctx) => {
            try {
                return ownedEntryNames(container(ctx));
            } catch {
                return [];
            }
        },
        existingKey: (ctx) => {
            if (spec.promptInput) return null;
            try {
                for (const entry of Object.values(container(ctx))) {
                    if (!isOwnedEntry(entry)) continue;
                    const key = bearerFromEntry(entry);
                    if (key) return key;
                }
            } catch {
                return null;
            }
            return null;
        },
        install: (ctx, servers, key) => {
            const file = load(ctx);
            const table = container(ctx);
            const authorization = spec.authorization?.(key) ?? `Bearer ${key}`;
            const changed: string[] = [];
            const unchanged: string[] = [];
            for (const server of servers) {
                const entry = spec.entry(server, authorization);
                if (
                    JSON.stringify(table[server.id]) === JSON.stringify(entry)
                ) {
                    unchanged.push(server.id);
                    continue;
                }
                table[server.id] = entry;
                changed.push(server.id);
            }
            if (spec.promptInput && changed.length > 0) {
                const inputs = Array.isArray(file.data.inputs)
                    ? (file.data.inputs as JsonObject[])
                    : [];
                if (
                    !inputs.some((input) => input.id === spec.promptInput?.id)
                ) {
                    file.data.inputs = [
                        ...inputs,
                        { type: "promptString", ...spec.promptInput },
                    ];
                }
            }
            if (changed.length === 0) {
                const notes = ["Already installed; nothing to change."];
                const note = spec.keyNote?.(key);
                if (note) notes.push(note);
                return {
                    client: spec.id,
                    label: spec.label,
                    servers: unchanged,
                    files: [file.path],
                    notes,
                };
            }
            writeTable(file.data, spec.table, table);
            writeJsonFile(file.path, file.data);

            const notes: string[] = [];
            if (file.jsonc) {
                notes.push(
                    `${file.path} uses JSON with comments; polli rewrote it as plain JSON.`,
                );
            }
            const note = spec.keyNote?.(key);
            if (note) notes.push(note);
            return {
                client: spec.id,
                label: spec.label,
                servers: [...changed, ...unchanged],
                files: [file.path],
                notes,
            };
        },
        remove: (ctx, names) => {
            const file = load(ctx);
            const table = container(ctx);
            const owned = ownedEntryNames(table);
            const targets = names.length
                ? owned.filter((name) => names.includes(name))
                : owned;
            if (targets.length === 0) {
                return {
                    client: spec.id,
                    label: spec.label,
                    servers: [],
                    files: [file.path],
                    notes: ["No Pollinations entries found."],
                };
            }
            for (const name of targets) delete table[name];
            if (spec.promptInput && targets.length === owned.length) {
                const inputs = Array.isArray(file.data.inputs)
                    ? (file.data.inputs as JsonObject[])
                    : [];
                const kept = inputs.filter(
                    (input) => input.id !== spec.promptInput?.id,
                );
                if (kept.length > 0) file.data.inputs = kept;
                else delete file.data.inputs;
            }
            writeTable(file.data, spec.table, table);
            writeJsonFile(file.path, file.data);
            return {
                client: spec.id,
                label: spec.label,
                servers: targets,
                files: [file.path],
                notes: [],
            };
        },
    };
};

const cursorFile = (ctx: McpContext) => join(ctx.home, ".cursor", "mcp.json");

const opencodeFiles = (ctx: McpContext) => [opencodeConfigFile(ctx)];
const vscodeUserDir = (ctx: McpContext) => {
    if (process.platform === "darwin") {
        return join(ctx.home, "Library", "Application Support", "Code", "User");
    }
    if (process.platform === "win32") {
        const roaming = ctx.env.APPDATA?.trim();
        return join(
            roaming
                ? resolveHomePath(ctx.home, roaming)
                : join(ctx.home, "AppData", "Roaming"),
            "Code",
            "User",
        );
    }
    const xdg = ctx.env.XDG_CONFIG_HOME?.trim();
    return join(
        xdg ? resolveHomePath(ctx.home, xdg) : join(ctx.home, ".config"),
        "Code",
        "User",
    );
};

/**
 * The Cline CLI reads ~/.cline/data/settings/cline_mcp_settings.json; the VS
 * Code extension keeps the same file under its global storage.
 */
const clineFiles = (ctx: McpContext) => {
    const cli = join(
        ctx.home,
        ".cline",
        "data",
        "settings",
        "cline_mcp_settings.json",
    );
    const nested = join(
        vscodeUserDir(ctx),
        "globalStorage",
        "saoudrizwan.claude-dev",
        "settings",
        "cline_mcp_settings.json",
    );
    return [cli, nested];
};

const COPILOT_INPUT = "pollinations-mcp-key";
const COPILOT_INPUT_DESCRIPTION = "Pollinations API key";

export const MCP_CLIENTS: McpClient[] = [
    jsonClient({
        id: "cursor",
        label: "Cursor",
        description: "Cursor's agent (user-level MCP config)",
        restartHint: "Reload Cursor to pick up the new servers.",
        paths: (ctx) => [cursorFile(ctx)],
        table: "mcpServers",
        entry: (server, authorization) => ({
            url: server.url,
            headers: authHeader(authorization),
        }),
    }),
    jsonClient({
        id: "vscode",
        label: "VS Code / Copilot Chat",
        description: "VS Code user profile MCP config",
        restartHint:
            "Run 'MCP: List Servers' in VS Code and start the new servers.",
        paths: (ctx) => [join(vscodeUserDir(ctx), "mcp.json")],
        table: "servers",
        entry: (server, authorization) => ({
            type: "http",
            url: server.url,
            headers: authHeader(authorization),
        }),
        authorization: () => `Bearer \${input:${COPILOT_INPUT}}`,
        promptInput: {
            id: COPILOT_INPUT,
            description: COPILOT_INPUT_DESCRIPTION,
        },
        keyNote: (key) =>
            `VS Code keeps input values in secret storage, so mcp.json only references \${input:${COPILOT_INPUT}}. Paste this key when VS Code prompts for "${COPILOT_INPUT_DESCRIPTION}": ${key}`,
    }),
    jsonClient({
        id: "opencode",
        label: "OpenCode",
        description: "OpenCode's `mcp` config table",
        restartHint: "Restart OpenCode to pick up the new servers.",
        paths: (ctx) => opencodeFiles(ctx),
        table: "mcp",
        entry: (server, authorization) => ({
            type: "remote",
            url: server.url,
            headers: authHeader(authorization),
            enabled: true,
        }),
    }),
    jsonClient({
        id: "windsurf",
        label: "Windsurf",
        description: "Windsurf's Cascade MCP config",
        restartHint: "Restart Windsurf to pick up the new servers.",
        paths: (ctx) => [
            join(ctx.home, ".codeium", "windsurf", "mcp_config.json"),
        ],
        table: "mcpServers",
        entry: (server, authorization) => ({
            serverUrl: server.url,
            headers: authHeader(authorization),
        }),
    }),
    jsonClient({
        id: "cline",
        label: "Cline",
        description: "Cline's MCP settings",
        restartHint: "Restart Cline to pick up the new servers.",
        paths: clineFiles,
        table: "mcpServers",
        entry: (server, authorization) => ({
            type: "streamableHttp",
            url: server.url,
            headers: authHeader(authorization),
        }),
    }),
    jsonClient({
        id: "kiro",
        label: "Kiro",
        description: "Kiro's user MCP config",
        restartHint: "Restart Kiro to pick up the new servers.",
        paths: (ctx) => [join(ctx.home, ".kiro", "settings", "mcp.json")],
        table: "mcpServers",
        entry: (server, authorization) => ({
            url: server.url,
            headers: authHeader(authorization),
        }),
    }),
    jsonClient({
        id: "warp",
        label: "Warp",
        description: "Warp's global file-based MCP config",
        restartHint: "Restart Warp to pick up the new servers.",
        paths: (ctx) => [join(ctx.home, ".warp", ".mcp.json")],
        table: "mcpServers",
        entry: (server, authorization) => ({
            url: server.url,
            headers: authHeader(authorization),
        }),
    }),
    jsonClient({
        id: "zed",
        label: "Zed",
        description: "Zed's context_servers settings",
        restartHint: "Restart Zed to pick up the new servers.",
        paths: (ctx) => [join(ctx.home, ".config", "zed", "settings.json")],
        table: "context_servers",
        entry: (server, authorization) => ({
            url: server.url,
            headers: authHeader(authorization),
        }),
    }),
    jsonClient({
        id: "copilot",
        label: "Copilot CLI",
        description: "GitHub Copilot CLI user-level MCP config",
        restartHint: "Start a new Copilot CLI session and run /mcp to verify.",
        paths: (ctx) => [join(ctx.home, ".copilot", "mcp-config.json")],
        table: "mcpServers",
        entry: (server, authorization) => ({
            type: "http",
            url: server.url,
            headers: authHeader(authorization),
        }),
    }),
];

interface CliClientSpec {
    id: string;
    label: string;
    description: string;
    restartHint: string;
    bin: string;
    addArgs(server: McpServer, key: string): string[];
    removeArgs(name: string): string[];
    configPaths(ctx: McpContext): string[];
    /** JSON config file and the table inside it, e.g. ["amp", "mcpServers"]. */
    config(ctx: McpContext): { path: string; table: string[] };
    /** Clients that do not keep servers in an mcpServers-style table. */
    installed?(ctx: McpContext): string[];
    existingKey?(ctx: McpContext): string | null;
    afterAdd?(
        ctx: McpContext,
        key: string,
    ): { files: string[]; notes: string[] };
    afterRemove?(ctx: McpContext): { files: string[]; notes: string[] };
}

const cliClient = (spec: CliClientSpec): McpClient => {
    const entries = (ctx: McpContext): JsonObject => {
        const { path, table } = spec.config(ctx);
        return readNestedTable(readJsonFile(path).data, table);
    };
    const installed = (ctx: McpContext) => {
        if (spec.installed) return spec.installed(ctx);
        try {
            return ownedEntryNames(entries(ctx));
        } catch {
            return [];
        }
    };
    const existingKey = (ctx: McpContext) => {
        if (spec.existingKey) return spec.existingKey(ctx);
        try {
            for (const entry of Object.values(entries(ctx))) {
                if (!isOwnedEntry(entry)) continue;
                const key = bearerFromEntry(entry);
                if (key) return key;
            }
        } catch {
            return null;
        }
        return null;
    };
    return {
        id: spec.id,
        label: spec.label,
        description: spec.description,
        restartHint: spec.restartHint,
        bin: spec.bin,
        available: (ctx) => commandExists(spec.bin, ctx.env),
        configPaths: spec.configPaths,
        installed,
        existingKey,
        install: (ctx, servers, key) => {
            const notes: string[] = [];
            const done: string[] = [];
            for (const server of servers) {
                if (installed(ctx).includes(server.id)) {
                    if (existingKey(ctx) === key) {
                        done.push(server.id);
                        continue;
                    }
                    runCli(spec.bin, spec.removeArgs(server.id), {
                        env: ctx.env,
                        secrets: [key],
                    });
                    notes.push(`Replaced the existing ${server.id} entry.`);
                }
                runCli(spec.bin, spec.addArgs(server, key), {
                    env: ctx.env,
                    secrets: [key],
                });
                done.push(server.id);
            }
            const extra = spec.afterAdd?.(ctx, key) ?? { files: [], notes: [] };
            return {
                client: spec.id,
                label: spec.label,
                servers: done,
                files: extra.files,
                notes: [...notes, ...extra.notes],
            };
        },
        remove: (ctx, names) => {
            const owned = installed(ctx);
            const targets = names.length
                ? owned.filter((name) => names.includes(name))
                : owned;
            if (targets.length === 0) {
                return {
                    client: spec.id,
                    label: spec.label,
                    servers: [],
                    files: [],
                    notes: ["No Pollinations entries found."],
                };
            }
            for (const name of targets) {
                runCli(spec.bin, spec.removeArgs(name), { env: ctx.env });
            }
            const extra = spec.afterRemove?.(ctx) ?? { files: [], notes: [] };
            return {
                client: spec.id,
                label: spec.label,
                servers: targets,
                files: extra.files,
                notes: extra.notes,
            };
        },
    };
};

const claudeConfigFile = (ctx: McpContext) => {
    const configured = ctx.env.CLAUDE_CONFIG_DIR?.trim();
    const dir = configured ? resolveHomePath(ctx.home, configured) : ctx.home;
    return join(dir, ".claude.json");
};

const codexHome = (ctx: McpContext) => {
    const configured = ctx.env.CODEX_HOME?.trim();
    return configured
        ? resolveHomePath(ctx.home, configured)
        : join(ctx.home, ".codex");
};
const codexConfigFile = (ctx: McpContext) =>
    join(codexHome(ctx), "config.toml");
const codexEnvFile = (ctx: McpContext) => join(codexHome(ctx), ".env");
/** Codex sends this variable as the bearer token; the name is never the key. */
const CODEX_KEY_ENV = "POLLI_MCP_CODEX_API_KEY";

const geminiSettingsFile = (ctx: McpContext) =>
    join(ctx.home, ".gemini", "settings.json");

const ampSettingsFile = (ctx: McpContext) => {
    const xdg = ctx.env.XDG_CONFIG_HOME?.trim();
    return join(
        xdg ? resolveHomePath(ctx.home, xdg) : join(ctx.home, ".config"),
        "amp",
        "settings.json",
    );
};

MCP_CLIENTS.push(
    cliClient({
        id: "claude-code",
        label: "Claude Code",
        description: "Claude Code's user-scope MCP servers",
        restartHint: "Run /mcp in Claude Code to verify the servers.",
        bin: "claude",
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
        removeArgs: (name) => ["mcp", "remove", "--scope", "user", name],
        configPaths: (ctx) => [claudeConfigFile(ctx)],
        config: (ctx) => ({
            path: claudeConfigFile(ctx),
            table: ["mcpServers"],
        }),
    }),
    cliClient({
        id: "codex",
        label: "Codex CLI",
        description: "Codex's config.toml MCP servers",
        restartHint: "Start a new Codex session and run /mcp to verify.",
        bin: "codex",
        addArgs: (server) => [
            "mcp",
            "add",
            server.id,
            "--url",
            server.url,
            "--bearer-token-env-var",
            CODEX_KEY_ENV,
        ],
        removeArgs: (name) => ["mcp", "remove", name],
        configPaths: (ctx) => [codexConfigFile(ctx), codexEnvFile(ctx)],
        config: (ctx) => ({
            path: codexConfigFile(ctx),
            table: ["mcp_servers"],
        }),
        installed: (ctx) =>
            Object.entries(
                readCodexServers(readTextIfExists(codexConfigFile(ctx))),
            )
                .filter(
                    ([, entry]) =>
                        typeof entry.url === "string" &&
                        entry.url.startsWith(mcpUrlPrefix),
                )
                .map(([name]) => name),
        existingKey: (ctx) => readEnvValue(codexEnvFile(ctx), CODEX_KEY_ENV),
        afterAdd: (ctx, key) => {
            const envFile = codexEnvFile(ctx);
            writeEnvValue(envFile, CODEX_KEY_ENV, key);
            return {
                files: [envFile],
                notes: [
                    `Codex sends $${CODEX_KEY_ENV} as the bearer token; polli stored it in ${envFile}. Export the variable in your shell if your Codex setup does not read that file.`,
                ],
            };
        },
        afterRemove: (ctx) => {
            const envFile = codexEnvFile(ctx);
            if (
                readTextIfExists(codexConfigFile(ctx))?.includes(mcpUrlPrefix)
            ) {
                return { files: [], notes: [] };
            }
            return removeEnvValue(envFile, CODEX_KEY_ENV)
                ? {
                      files: [envFile],
                      notes: [`Removed $${CODEX_KEY_ENV} from ${envFile}.`],
                  }
                : { files: [], notes: [] };
        },
    }),
    cliClient({
        id: "gemini",
        label: "Gemini CLI",
        description: "Gemini CLI's user-scope MCP servers",
        restartHint: "Run /mcp in Gemini CLI to verify the servers.",
        bin: "gemini",
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
        removeArgs: (name) => ["mcp", "remove", "--scope", "user", name],
        configPaths: (ctx) => [geminiSettingsFile(ctx)],
        config: (ctx) => ({
            path: geminiSettingsFile(ctx),
            table: ["mcpServers"],
        }),
    }),
    cliClient({
        id: "amp",
        label: "Amp",
        description: "Amp's user settings MCP servers",
        restartHint:
            "Start a new Amp session and run 'amp mcp list' to verify.",
        bin: "amp",
        addArgs: (server, key) => [
            "mcp",
            "add",
            server.id,
            server.url,
            "--header",
            `Authorization=Bearer ${key}`,
        ],
        removeArgs: (name) => ["mcp", "remove", name],
        configPaths: (ctx) => [ampSettingsFile(ctx)],
        config: (ctx) => ({
            path: ampSettingsFile(ctx),
            table: ["amp", "mcpServers"],
        }),
    }),
);

export const findClient = (id: string): McpClient | null =>
    MCP_CLIENTS.find((client) => client.id === id.trim().toLowerCase()) ?? null;
