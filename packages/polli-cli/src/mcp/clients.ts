import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import json5 from "json5";
import { writeTextAtomic } from "../harnesses/fs.js";
import { printInfo, printSuccess, printWarn } from "../lib/output.js";

/**
 * Install/uninstall the Pollinations MCP server into coding-agent clients.
 *
 * Two adapter kinds:
 * - "json": edit the client's JSON config directly (most editors/IDEs).
 * - "cli": delegate to the client's own `mcp add` command (Claude Code,
 *   Codex, Gemini CLI) so we always match the client's canonical config.
 *
 * Auth: clients that take the secret by env var name (Codex
 * `bearer_token_env_var`) get `${AUTH_ENV_VAR}` referenced in their config and
 * the literal key provisioned outside the config file. Everything else gets
 * the literal key written into an Authorization header.
 */

export const AUTH_ENV_VAR = "POLLINATIONS_MCP_API_KEY";

export interface McpServerRef {
    id: string;
    url: string;
    name: string;
}

export interface InstallContext {
    server: McpServerRef;
    apiKey: string;
}

export const serverEntryName = (server: McpServerRef): string =>
    `pollinations-${server.id}`;

const bearerHeaders = (apiKey: string): Record<string, string> => ({
    Authorization: `Bearer ${apiKey}`,
});

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const home = (...parts: string[]): string => path.join(os.homedir(), ...parts);

const appData = (): string =>
    process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");

const vscodeConfig = (file: string): string => {
    switch (process.platform) {
        case "win32":
            return path.join(appData(), "Code", "User", file);
        case "darwin":
            return home("Library", "Application Support", "Code", "User", file);
        default:
            return home(".config", "Code", "User", file);
    }
};

const clineSettings = (): string =>
    vscodeConfig(
        path.join(
            "globalStorage",
            "saoudrizwan.claude-dev",
            "settings",
            "cline_mcp_settings.json",
        ),
    );

const claudeDesktopConfig = (): string =>
    process.platform === "darwin"
        ? home(
              "Library",
              "Application Support",
              "Claude",
              "claude_desktop_config.json",
          )
        : path.join(appData(), "Claude", "claude_desktop_config.json");

const zedSettings = (): string =>
    process.platform === "win32"
        ? path.join(appData(), "Zed", "settings.json")
        : home(".config", "zed", "settings.json");

// ---------------------------------------------------------------------------
// Pure cores (unit-tested)
// ---------------------------------------------------------------------------

/** Best-effort URL of a stored server entry (clients disagree on the field). */
export const entryUrl = (entry: unknown): string | undefined => {
    if (typeof entry !== "object" || entry === null) return undefined;
    const rec = entry as Record<string, unknown>;
    return [rec.url, rec.serverUrl].find(
        (v): v is string => typeof v === "string",
    );
};

export type UpsertResult = "updated" | "unchanged" | "foreign";

/**
 * Insert/replace `name` under `doc[root]`. A same-named entry pointing at a
 * different URL is never clobbered ("foreign") — that's user config.
 */
export const upsertJsonServer = (
    doc: Record<string, unknown>,
    root: string,
    name: string,
    entry: Record<string, unknown>,
    serverUrl: string,
): UpsertResult => {
    const servers = (doc[root] as Record<string, unknown> | undefined) ?? {};
    const previous = servers[name];
    if (previous !== undefined) {
        const prevUrl = entryUrl(previous);
        if (prevUrl !== undefined && prevUrl !== serverUrl) return "foreign";
        if (JSON.stringify(previous) === JSON.stringify(entry))
            return "unchanged";
    }
    servers[name] = entry;
    doc[root] = servers;
    return "updated";
};

export type RemoveResult = "removed" | "absent" | "foreign";

/** Delete `name` under `doc[root]` only if it points at `serverUrl`. */
export const removeJsonServer = (
    doc: Record<string, unknown>,
    root: string,
    name: string,
    serverUrl: string,
): RemoveResult => {
    const servers = (doc[root] as Record<string, unknown> | undefined) ?? {};
    const previous = servers[name];
    if (previous === undefined) return "absent";
    const prevUrl = entryUrl(previous);
    if (prevUrl !== undefined && prevUrl !== serverUrl) return "foreign";
    delete servers[name];
    return "removed";
};

/**
 * Add `NAME=value` to env-file lines (Codex `~/.codex/.env`). An existing
 * different value is kept — the var name is generic, so it may be user-owned.
 */
export const withEnvVar = (
    lines: string[],
    name: string,
    value: string,
): { lines: string[]; result: "appended" | "unchanged" | "kept" } => {
    const wanted = `${name}=${value}`;
    const index = lines.findIndex((l) => l.startsWith(`${name}=`));
    if (index === -1) return { lines: [...lines, wanted], result: "appended" };
    if (lines[index] === wanted) return { lines, result: "unchanged" };
    return { lines, result: "kept" };
};

/**
 * Catalog data and minted keys can reach `cmd.exe` on Windows (npm .cmd
 * shims), so anything that may land on a command line is charset-checked
 * before any process is spawned. The API never sends shell metacharacters —
 * an input carrying one means a tampered or spoofed catalog, and we refuse
 * it rather than pass it through.
 */
const SERVER_ID_RE = /^[a-z0-9][a-z0-9._-]*$/i;
const API_KEY_RE = /^[A-Za-z0-9._-]+$/;
const SHELL_UNSAFE = /[&|<>^%$"';`()\s!]/;

export const assertSafeInstallInputs = (
    server: McpServerRef,
    apiKey?: string,
): void => {
    if (!SERVER_ID_RE.test(server.id)) {
        throw new Error(
            `Refusing to install: server id "${server.id}" is not a safe identifier.`,
        );
    }
    if (SHELL_UNSAFE.test(server.name)) {
        throw new Error(
            `Refusing to install: server name contains forbidden characters.`,
        );
    }
    let parsed: URL;
    try {
        parsed = new URL(server.url);
    } catch {
        throw new Error(`Refusing to install: server URL is not a valid URL.`);
    }
    if (parsed.protocol !== "https:") {
        throw new Error(
            `Refusing to install: server URL must be https (got ${parsed.protocol}).`,
        );
    }
    if (SHELL_UNSAFE.test(server.url)) {
        throw new Error(
            `Refusing to install: server URL contains shell metacharacters.`,
        );
    }
    if (apiKey !== undefined && !API_KEY_RE.test(apiKey)) {
        throw new Error(
            `Refusing to install: API key format is not recognized — not writing it to any client.`,
        );
    }
};

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

export interface ClientAdapter {
    id: string;
    label: string;
    detect: () => boolean;
}

export interface JsonAdapter extends ClientAdapter {
    kind: "json";
    root: string;
    configPath: () => string;
    entry: (ctx: InstallContext) => Record<string, unknown>;
}

export interface CliAdapter extends ClientAdapter {
    kind: "cli";
    binary: string;
    addArgs: (ctx: InstallContext, name: string) => string[];
    removeArgs: (name: string) => string[];
    postInstall?: (ctx: InstallContext) => void;
    /** True if the client's config already registers `name`. */
    isInstalled: (name: string) => boolean;
}

const dirExists = (dir: string): boolean => {
    try {
        return fs.statSync(dir).isDirectory();
    } catch {
        return false;
    }
};

const fileExists = (file: string): boolean => {
    try {
        return fs.statSync(file).isFile();
    } catch {
        return false;
    }
};

const readJsonDoc = (file: string): Record<string, unknown> => {
    try {
        return json5.parse(fs.readFileSync(file, "utf8")) as Record<
            string,
            unknown
        >;
    } catch {
        return {};
    }
};

const jsonEntryInstalled = (adapter: JsonAdapter, name: string): boolean => {
    const doc = readJsonDoc(adapter.configPath());
    const servers = doc[adapter.root] as Record<string, unknown> | undefined;
    return servers?.[name] !== undefined;
};

/** PATH lookup honoring PATHEXT on Windows, so .cmd shims resolve too. */
export const resolveBinary = (bin: string): string | null => {
    const exts =
        process.platform === "win32"
            ? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";")
            : [""];
    for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
        for (const ext of exts) {
            const candidate = path.join(dir, bin + ext.toLowerCase());
            try {
                fs.accessSync(candidate, fs.constants.X_OK);
                return candidate;
            } catch {
                // keep scanning
            }
        }
    }
    return null;
};

/** Spawn a client binary; .cmd/.bat shims on Windows go through cmd.exe with
 * pre-quoted args (cmd re-parses %*, so spaced args must arrive pre-quoted). */
const runBinary = (
    file: string,
    args: string[],
): { status: number | null; stderr: string } => {
    const isShim = process.platform === "win32" && /\.(cmd|bat)$/i.test(file);
    if (isShim) {
        // Defense in depth: inputs are validated upstream
        // (assertSafeInstallInputs), but refuse to hand anything carrying a
        // cmd.exe metacharacter to a shell-parsed command line.
        for (const arg of args) {
            if (SHELL_UNSAFE.test(arg)) {
                throw new Error(
                    `Refusing to run: argument contains shell metacharacters.`,
                );
            }
        }
        const cmdline = [file, ...args]
            .map((a) => (/\s/.test(a) ? `"${a}"` : a))
            .join(" ");
        const proc = spawnSync(cmdline, [], {
            shell: true,
            encoding: "utf8",
        });
        return { status: proc.status, stderr: proc.stderr ?? "" };
    }
    const proc = spawnSync(file, args, { encoding: "utf8" });
    return { status: proc.status, stderr: proc.stderr ?? "" };
};

const writeEnvFileKey = (ctx: InstallContext) => {
    const file = home(".codex", ".env");
    let lines: string[] = [];
    try {
        lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    } catch {
        // first time — start empty
    }
    const { lines: next, result } = withEnvVar(lines, AUTH_ENV_VAR, ctx.apiKey);
    if (result === "unchanged") return;
    if (result === "kept") {
        printInfo(
            `${AUTH_ENV_VAR} is already set in ${file} — Codex will use that key (left untouched).`,
        );
        return;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // The env file holds the literal key — owner-only file.
    writeTextAtomic(
        file,
        `${next.filter((l) => l.length > 0).join("\n")}\n`,
        0o600,
    );
};

const claudeDesktop: JsonAdapter = {
    kind: "json",
    id: "claude-desktop",
    label: "Claude Desktop",
    detect: () =>
        fileExists(claudeDesktopConfig()) ||
        dirExists(path.dirname(claudeDesktopConfig())),
    root: "mcpServers",
    configPath: claudeDesktopConfig,
    entry: (ctx) => ({
        url: ctx.server.url,
        headers: bearerHeaders(ctx.apiKey),
    }),
};

const claude: CliAdapter = {
    kind: "cli",
    id: "claude",
    label: "Claude Code",
    binary: "claude",
    detect: () => resolveBinary("claude") !== null,
    addArgs: (ctx, name) => [
        "mcp",
        "add",
        "--transport",
        "http",
        name,
        ctx.server.url,
        "--header",
        `Authorization: Bearer ${ctx.apiKey}`,
        "--scope",
        "user",
    ],
    removeArgs: (name) => ["mcp", "remove", name, "--scope", "user"],
    isInstalled: (name) => {
        const doc = readJsonDoc(home(".claude.json"));
        const servers = doc.mcpServers as Record<string, unknown> | undefined;
        return servers?.[name] !== undefined;
    },
};

const codex: CliAdapter = {
    kind: "cli",
    id: "codex",
    label: "OpenAI Codex CLI",
    binary: "codex",
    detect: () => resolveBinary("codex") !== null,
    addArgs: (ctx, name) => [
        "mcp",
        "add",
        name,
        "--url",
        ctx.server.url,
        "--bearer-token-env-var",
        AUTH_ENV_VAR,
    ],
    removeArgs: (name) => ["mcp", "remove", name],
    postInstall: writeEnvFileKey,
    isInstalled: (name) => {
        try {
            return fs
                .readFileSync(home(".codex", "config.toml"), "utf8")
                .includes(`[mcp_servers.${name}]`);
        } catch {
            return false;
        }
    },
};

const gemini: CliAdapter = {
    kind: "cli",
    id: "gemini",
    label: "Gemini CLI",
    binary: "gemini",
    detect: () => resolveBinary("gemini") !== null,
    addArgs: (ctx, name) => [
        "mcp",
        "add",
        "--transport",
        "http",
        name,
        ctx.server.url,
        "--header",
        `Authorization: Bearer ${ctx.apiKey}`,
        "--scope",
        "user",
    ],
    removeArgs: (name) => ["mcp", "remove", name, "--scope", "user"],
    isInstalled: (name) => {
        const doc = readJsonDoc(home(".gemini", "settings.json"));
        const servers = doc.mcpServers as Record<string, unknown> | undefined;
        return servers?.[name] !== undefined;
    },
};

const cursor: JsonAdapter = {
    kind: "json",
    id: "cursor",
    label: "Cursor",
    detect: () => dirExists(home(".cursor")),
    root: "mcpServers",
    configPath: () => home(".cursor", "mcp.json"),
    entry: (ctx) => ({
        url: ctx.server.url,
        headers: bearerHeaders(ctx.apiKey),
    }),
};

const windsurf: JsonAdapter = {
    kind: "json",
    id: "windsurf",
    label: "Windsurf",
    detect: () => dirExists(home(".codeium", "windsurf")),
    root: "mcpServers",
    configPath: () => home(".codeium", "windsurf", "mcp_config.json"),
    entry: (ctx) => ({
        serverUrl: ctx.server.url,
        headers: bearerHeaders(ctx.apiKey),
    }),
};

const cline: JsonAdapter = {
    kind: "json",
    id: "cline",
    label: "Cline",
    detect: () =>
        fileExists(clineSettings()) ||
        dirExists(path.dirname(path.dirname(clineSettings()))),
    root: "mcpServers",
    configPath: clineSettings,
    entry: (ctx) => ({
        type: "streamableHttp",
        url: ctx.server.url,
        headers: bearerHeaders(ctx.apiKey),
        disabled: false,
        autoApprove: [],
    }),
};

const kiro: JsonAdapter = {
    kind: "json",
    id: "kiro",
    label: "Kiro",
    detect: () => dirExists(home(".kiro")),
    root: "mcpServers",
    configPath: () => home(".kiro", "settings", "mcp.json"),
    entry: (ctx) => ({
        type: "http",
        url: ctx.server.url,
        headers: bearerHeaders(ctx.apiKey),
        disabled: false,
        autoApprove: [],
    }),
};

const zed: JsonAdapter = {
    kind: "json",
    id: "zed",
    label: "Zed",
    detect: () => fileExists(zedSettings()),
    root: "context_servers",
    configPath: zedSettings,
    entry: (ctx) => ({
        source: "custom",
        url: ctx.server.url,
        headers: bearerHeaders(ctx.apiKey),
    }),
};

const warp: JsonAdapter = {
    kind: "json",
    id: "warp",
    label: "Warp",
    detect: () => dirExists(home(".warp")),
    root: "mcpServers",
    configPath: () => home(".warp", "mcp_config.json"),
    entry: (ctx) => ({
        url: ctx.server.url,
        headers: bearerHeaders(ctx.apiKey),
    }),
};

const opencode: JsonAdapter = {
    kind: "json",
    id: "opencode",
    label: "OpenCode",
    detect: () => dirExists(home(".config", "opencode")),
    root: "mcp",
    configPath: () => home(".config", "opencode", "opencode.json"),
    entry: (ctx) => ({
        type: "remote",
        url: ctx.server.url,
        headers: bearerHeaders(ctx.apiKey),
        enabled: true,
    }),
};

const vscode: JsonAdapter = {
    kind: "json",
    id: "vscode",
    label: "VS Code / Copilot",
    detect: () =>
        fileExists(vscodeConfig("mcp.json")) || resolveBinary("code") !== null,
    root: "servers",
    configPath: () => vscodeConfig("mcp.json"),
    entry: (ctx) => ({
        type: "http",
        url: ctx.server.url,
        headers: bearerHeaders(ctx.apiKey),
    }),
};

export const ALL_CLIENTS: Array<JsonAdapter | CliAdapter> = [
    claude,
    codex,
    gemini,
    cursor,
    windsurf,
    cline,
    kiro,
    zed,
    warp,
    opencode,
    vscode,
    claudeDesktop,
];

// ---------------------------------------------------------------------------
// Install / remove
// ---------------------------------------------------------------------------

export type InstallOutcome =
    | { client: string; status: "installed" }
    | { client: string; status: "unchanged" }
    | { client: string; status: "skipped"; detail: string }
    | { client: string; status: "error"; detail: string };

export type RemoveOutcome =
    | { client: string; status: "removed" }
    | { client: string; status: "absent" }
    | { client: string; status: "skipped"; detail: string };

const writeJsonConfig = (
    adapter: JsonAdapter,
    ctx: InstallContext,
    name: string,
): InstallOutcome => {
    const file = adapter.configPath();
    const existed = fileExists(file);
    const doc = readJsonDoc(file);
    const outcome = upsertJsonServer(
        doc,
        adapter.root,
        name,
        adapter.entry(ctx),
        ctx.server.url,
    );
    if (outcome === "foreign") {
        printWarn(
            `${adapter.label}: an entry named "${name}" already points elsewhere — leaving it untouched.`,
        );
        return {
            client: adapter.label,
            status: "skipped",
            detail: "foreign entry",
        };
    }
    if (outcome === "unchanged") {
        printInfo(`${adapter.label}: already configured.`);
        return { client: adapter.label, status: "unchanged" };
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // The JSON config embeds the bearer key — owner-only file, written via
    // temp+rename so a crash never leaves a half-written config behind.
    writeTextAtomic(file, `${JSON.stringify(doc, null, 2)}\n`, 0o600);
    printSuccess(
        `${adapter.label}: installed${existed ? "" : ` (created ${file})`}.`,
    );
    return { client: adapter.label, status: "installed" };
};

export const installForClient = (
    adapter: JsonAdapter | CliAdapter,
    ctx: InstallContext,
): InstallOutcome => {
    assertSafeInstallInputs(ctx.server, ctx.apiKey);
    const name = serverEntryName(ctx.server);
    if (adapter.kind === "json") return writeJsonConfig(adapter, ctx, name);

    const binary = resolveBinary(adapter.binary);
    if (!binary) {
        return {
            client: adapter.label,
            status: "skipped",
            detail: `${adapter.binary} not on PATH`,
        };
    }
    // Reinstall cleanly: a previous registration may hold stale values.
    runBinary(binary, adapter.removeArgs(name));
    const add = runBinary(binary, adapter.addArgs(ctx, name));
    if (add.status !== 0) {
        throw new Error(
            `${adapter.label} exited with code ${add.status}: ${add.stderr.trim()}`,
        );
    }
    adapter.postInstall?.(ctx);
    printSuccess(`${adapter.label}: installed via ${adapter.binary} mcp add.`);
    return { client: adapter.label, status: "installed" };
};

export const removeForClient = (
    adapter: JsonAdapter | CliAdapter,
    server: McpServerRef,
): RemoveOutcome => {
    assertSafeInstallInputs(server);
    const name = serverEntryName(server);
    if (adapter.kind === "cli") {
        const binary = resolveBinary(adapter.binary);
        if (!binary) {
            return {
                client: adapter.label,
                status: "skipped",
                detail: `${adapter.binary} not on PATH`,
            };
        }
        if (!adapter.isInstalled(name))
            return { client: adapter.label, status: "absent" };
        const rm = runBinary(binary, adapter.removeArgs(name));
        if (rm.status !== 0) {
            throw new Error(
                `${adapter.label} exited with code ${rm.status}: ${rm.stderr.trim()}`,
            );
        }
        printSuccess(`${adapter.label}: removed.`);
        return { client: adapter.label, status: "removed" };
    }

    const file = adapter.configPath();
    if (!fileExists(file)) return { client: adapter.label, status: "absent" };
    const doc = readJsonDoc(file);
    const outcome = removeJsonServer(doc, adapter.root, name, server.url);
    if (outcome === "absent")
        return { client: adapter.label, status: "absent" };
    if (outcome === "foreign") {
        return {
            client: adapter.label,
            status: "skipped",
            detail: "entry points elsewhere — not ours to remove",
        };
    }
    fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
    printSuccess(`${adapter.label}: removed.`);
    return { client: adapter.label, status: "removed" };
};

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export interface ClientStatus {
    client: string;
    detected: boolean;
    installed: boolean;
    config: string;
}

export const statusForClient = (
    adapter: JsonAdapter | CliAdapter,
    server: McpServerRef,
): ClientStatus => {
    const name = serverEntryName(server);
    const detected = adapter.detect();
    const installed =
        adapter.kind === "json"
            ? jsonEntryInstalled(adapter, name)
            : adapter.isInstalled(name);
    return {
        client: adapter.label,
        detected,
        installed,
        config:
            adapter.kind === "json"
                ? adapter.configPath()
                : `${adapter.binary} mcp`,
    };
};
