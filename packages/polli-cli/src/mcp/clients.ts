import { spawnSync } from "node:child_process";
import { join } from "node:path";
import JSON5 from "json5";
import {
    commandExists,
    readTextIfExists,
    resolveHomePath,
    writeTextAtomic,
} from "../harnesses/fs.js";
import type { HarnessContext } from "../harnesses/types.js";
import type { CatalogServer } from "./catalog.js";

export const POLLI_MARKER = "__polli";

export type McpStatus = {
    installed: string[];
    count: number;
    path: string;
};

export type McpClient = {
    id: string;
    label: string;
    docsUrl: string;
    useEnvVar: boolean;
    /** Prefer this binary's `mcp add` when present on PATH. */
    cli?: string;
    configPath: (ctx: HarnessContext) => string;
    write: (
        ctx: HarnessContext,
        servers: CatalogServer[],
        apiKey: string,
    ) => void;
    remove: (ctx: HarnessContext, serverIds?: string[]) => boolean;
    status: (ctx: HarnessContext) => McpStatus;
    /** Optional CLI install; return true if handled. */
    tryCliAdd?: (
        ctx: HarnessContext,
        servers: CatalogServer[],
        apiKey: string,
    ) => boolean;
};

export function keyEnvVar(clientId: string): string {
    return `POLLI_MCP_${clientId.toUpperCase().replace(/-/g, "_")}_API_KEY`;
}

export function isPolliEntry(entry: unknown): boolean {
    if (!entry || typeof entry !== "object") return false;
    const obj = entry as Record<string, unknown>;
    if (obj[POLLI_MARKER] === true) return true;
    const url = typeof obj.url === "string" ? obj.url : "";
    if (url.includes("gen.pollinations.ai/mcp")) return true;
    if (Array.isArray(obj.args)) {
        return obj.args.some((a) =>
            String(a).includes("gen.pollinations.ai/mcp"),
        );
    }
    return false;
}

function readJson(path: string): Record<string, unknown> | null {
    const text = readTextIfExists(path);
    if (text === null) return null;
    const parsed = JSON5.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(`Config at ${path} must be a JSON object`);
    }
    return parsed as Record<string, unknown>;
}

function writeJson(path: string, data: unknown) {
    writeTextAtomic(path, `${JSON.stringify(data, null, 2)}\n`, 0o600);
}

function httpEntry(
    url: string,
    apiKey: string,
    extra: Record<string, unknown> = {},
) {
    return {
        type: "http",
        url,
        headers: { Authorization: `Bearer ${apiKey}` },
        [POLLI_MARKER]: true,
        ...extra,
    };
}

type MapClientOpts = {
    id: string;
    label: string;
    docsUrl: string;
    relPath?: string;
    pathOf?: (ctx: HarnessContext) => string;
    mapKey?: string;
    useEnvVar?: boolean;
    cli?: string;
    entry?: (
        server: CatalogServer,
        apiKey: string,
        ctx: HarnessContext,
    ) => Record<string, unknown>;
    envPath?: (ctx: HarnessContext) => string | null;
};

function jsonMapClient(opts: MapClientOpts): McpClient {
    const mapKey = opts.mapKey ?? "mcpServers";
    const pathOf =
        opts.pathOf ??
        ((ctx: HarnessContext) => join(ctx.home, opts.relPath ?? ".mcp.json"));
    const makeEntry = opts.entry ?? ((s, key) => httpEntry(s.url, key));

    return {
        id: opts.id,
        label: opts.label,
        docsUrl: opts.docsUrl,
        useEnvVar: opts.useEnvVar ?? false,
        cli: opts.cli,
        configPath: pathOf,
        write(ctx, servers, apiKey) {
            const path = pathOf(ctx);
            const cfg = readJson(path) ?? {};
            const map =
                (cfg[mapKey] as Record<string, unknown> | undefined) ?? {};
            for (const s of servers) map[s.id] = makeEntry(s, apiKey, ctx);
            cfg[mapKey] = map;
            writeJson(path, cfg);
            const envFile = opts.envPath?.(ctx);
            if (envFile && opts.useEnvVar) {
                writeTextAtomic(
                    envFile,
                    `${keyEnvVar(opts.id)}=${apiKey}\n`,
                    0o600,
                );
            }
        },
        remove(ctx, serverIds) {
            const path = pathOf(ctx);
            const cfg = readJson(path);
            if (!cfg) return false;
            const map = cfg[mapKey] as Record<string, unknown> | undefined;
            if (!map) return false;
            let changed = false;
            const filter = serverIds ? new Set(serverIds) : null;
            for (const [k, v] of Object.entries(map)) {
                if (filter && !filter.has(k)) continue;
                if (isPolliEntry(v)) {
                    delete map[k];
                    changed = true;
                }
            }
            if (changed) {
                if (Object.keys(map).length === 0) delete cfg[mapKey];
                writeJson(path, cfg);
            }
            return changed;
        },
        status(ctx) {
            const path = pathOf(ctx);
            const cfg = readJson(path);
            const map =
                (cfg?.[mapKey] as Record<string, unknown> | undefined) ?? {};
            const installed = Object.entries(map)
                .filter(([, v]) => isPolliEntry(v))
                .map(([k]) => k);
            return { installed, count: installed.length, path };
        },
    };
}

function runCli(bin: string, args: string[]): boolean {
    if (!commandExists(bin)) return false;
    const result = spawnSync(bin, args, { encoding: "utf8" });
    return result.status === 0;
}

// ---- Claude Code ----
const claudeCode = jsonMapClient({
    id: "claude-code",
    label: "Claude Code",
    docsUrl: "https://code.claude.com/docs/en/mcp",
    pathOf: (ctx) =>
        ctx.env.CLAUDE_CONFIG?.trim()
            ? resolveHomePath(ctx.home, ctx.env.CLAUDE_CONFIG)
            : join(ctx.home, ".claude.json"),
    cli: "claude",
});
claudeCode.tryCliAdd = (_ctx, servers, apiKey) => {
    let ok = true;
    for (const s of servers) {
        const handled = runCli("claude", [
            "mcp",
            "add",
            "--transport",
            "http",
            s.id,
            s.url,
            "--header",
            `Authorization: Bearer ${apiKey}`,
        ]);
        if (!handled) ok = false;
    }
    return ok && servers.length > 0;
};

// ---- Cursor ----
const cursor = jsonMapClient({
    id: "cursor",
    label: "Cursor",
    docsUrl: "https://cursor.com/docs/context/mcp/install-links",
    relPath: ".cursor/mcp.json",
});

// ---- OpenCode ----
const opencode = jsonMapClient({
    id: "opencode",
    label: "OpenCode",
    docsUrl: "https://opencode.ai/docs/mcp-servers/",
    relPath: ".config/opencode/opencode.json",
    mapKey: "mcp",
    entry: (s, key) => ({
        type: "remote",
        url: s.url,
        headers: { Authorization: `Bearer ${key}` },
        [POLLI_MARKER]: true,
    }),
});

// ---- Gemini ----
const gemini = jsonMapClient({
    id: "gemini",
    label: "Gemini CLI",
    docsUrl: "https://geminicli.com/docs/tools/mcp-server/",
    relPath: ".gemini/settings.json",
    cli: "gemini",
});
gemini.tryCliAdd = (_ctx, servers, apiKey) => {
    let ok = true;
    for (const s of servers) {
        const handled = runCli("gemini", [
            "mcp",
            "add",
            "--transport",
            "http",
            s.id,
            s.url,
            "--header",
            `Authorization: Bearer ${apiKey}`,
        ]);
        if (!handled) ok = false;
    }
    return ok && servers.length > 0;
};

// ---- Codex (TOML + env var) ----
function codexPath(ctx: HarnessContext): string {
    if (ctx.env.CODEX_HOME?.trim()) {
        return join(
            resolveHomePath(ctx.home, ctx.env.CODEX_HOME),
            "config.toml",
        );
    }
    return join(ctx.home, ".codex", "config.toml");
}

const codex: McpClient = {
    id: "codex",
    label: "Codex CLI",
    docsUrl: "https://learn.chatgpt.com/docs/extend/mcp?surface=cli",
    useEnvVar: true,
    cli: "codex",
    configPath: codexPath,
    tryCliAdd(_ctx, servers, _apiKey) {
        const envVar = keyEnvVar("codex");
        let ok = true;
        for (const s of servers) {
            const handled = runCli("codex", [
                "mcp",
                "add",
                s.id,
                "--url",
                s.url,
                "--bearer-token-env-var",
                envVar,
            ]);
            if (!handled) ok = false;
        }
        return ok && servers.length > 0;
    },
    write(ctx, servers, apiKey) {
        const path = codexPath(ctx);
        const envVar = keyEnvVar("codex");
        let text = readTextIfExists(path) ?? "";
        for (const s of servers) {
            const block = `\n[mcp_servers.${s.id}]\nurl = "${s.url}"\nbearer_token_env_var = "${envVar}"\n# ${POLLI_MARKER}\n`;
            const re = new RegExp(`\\[mcp_servers\\.${s.id}\\][^\\[]*`, "m");
            text = re.test(text)
                ? text.replace(re, `${block.trim()}\n`)
                : `${text.trimEnd()}${block}`;
        }
        writeTextAtomic(path, text.endsWith("\n") ? text : `${text}\n`, 0o600);
        writeTextAtomic(
            join(ctx.home, ".pollinations", "mcp-codex.env"),
            `${envVar}=${apiKey}\n`,
            0o600,
        );
    },
    remove(ctx, serverIds) {
        const path = codexPath(ctx);
        const text = readTextIfExists(path);
        if (text === null) return false;
        let next = text;
        let changed = false;
        const drop = (id: string) => {
            const re = new RegExp(`\\n\\[mcp_servers\\.${id}\\][^\\[]*`, "m");
            if (re.test(next)) {
                next = next.replace(re, "\n");
                changed = true;
            }
        };
        if (serverIds?.length) serverIds.forEach(drop);
        else {
            const re =
                /\n\[mcp_servers\.[^\]]+\][^[]*(?:gen\.pollinations\.ai\/mcp|# __polli)[^[]*/g;
            const before = next;
            next = next.replace(re, "\n");
            changed = next !== before;
        }
        if (changed) writeTextAtomic(path, next, 0o600);
        return changed;
    },
    status(ctx) {
        const path = codexPath(ctx);
        const text = readTextIfExists(path) ?? "";
        const installed: string[] = [];
        const re = /\[mcp_servers\.([^\]]+)\][^[]*gen\.pollinations\.ai\/mcp/g;
        for (const m of text.matchAll(re)) {
            if (m[1]) installed.push(m[1]);
        }
        return { installed, count: installed.length, path };
    },
};

// ---- VS Code (inputs + mcp.json) ----
const VSCODE_AUTH_HEADER = "${" + "input:polli-mcp-key}";

function vscodePath(ctx: HarnessContext): string {
    if (ctx.env.VSCODE_MCP_CONFIG?.trim()) {
        return resolveHomePath(ctx.home, ctx.env.VSCODE_MCP_CONFIG);
    }
    return join(ctx.home, ".vscode", "mcp.json");
}

const vscode: McpClient = {
    id: "vscode",
    label: "VS Code / Copilot",
    docsUrl:
        "https://code.visualstudio.com/docs/copilot/customization/mcp-servers",
    useEnvVar: true,
    cli: "code",
    configPath: vscodePath,
    tryCliAdd(_ctx, servers, _apiKey) {
        // `code --add-mcp` expects a JSON server definition string.
        let ok = true;
        for (const s of servers) {
            const payload = JSON.stringify({
                name: s.id,
                type: "http",
                url: s.url,
                headers: {
                    Authorization: VSCODE_AUTH_HEADER,
                },
            });
            const handled = runCli("code", ["--add-mcp", payload]);
            if (!handled) ok = false;
        }
        return ok && servers.length > 0;
    },
    write(ctx, servers, apiKey) {
        const path = vscodePath(ctx);
        const cfg = readJson(path) ?? {};
        const inputs = Array.isArray(cfg.inputs) ? [...cfg.inputs] : [];
        if (
            !inputs.some((i) => (i as { id?: string }).id === "polli-mcp-key")
        ) {
            inputs.push({
                id: "polli-mcp-key",
                type: "promptString",
                description: "Pollinations MCP API key",
                password: true,
            });
        }
        cfg.inputs = inputs;
        const serversMap =
            (cfg.servers as Record<string, unknown> | undefined) ?? {};
        for (const s of servers) {
            serversMap[s.id] = {
                type: "http",
                url: s.url,
                headers: { Authorization: VSCODE_AUTH_HEADER },
                [POLLI_MARKER]: true,
            };
        }
        cfg.servers = serversMap;
        writeJson(path, cfg);
        writeTextAtomic(
            join(ctx.home, ".pollinations", "mcp-vscode.env"),
            `POLLI_MCP_VSCODE_API_KEY=${apiKey}\n`,
            0o600,
        );
    },
    remove(ctx, serverIds) {
        const path = vscodePath(ctx);
        const cfg = readJson(path);
        if (!cfg) return false;
        const serversMap = cfg.servers as Record<string, unknown> | undefined;
        if (!serversMap) return false;
        let changed = false;
        const filter = serverIds ? new Set(serverIds) : null;
        for (const [k, v] of Object.entries(serversMap)) {
            if (filter && !filter.has(k)) continue;
            if (isPolliEntry(v)) {
                delete serversMap[k];
                changed = true;
            }
        }
        if (changed) writeJson(path, cfg);
        return changed;
    },
    status(ctx) {
        const path = vscodePath(ctx);
        const cfg = readJson(path);
        const serversMap =
            (cfg?.servers as Record<string, unknown> | undefined) ?? {};
        const installed = Object.entries(serversMap)
            .filter(([, v]) => isPolliEntry(v))
            .map(([k]) => k);
        return { installed, count: installed.length, path };
    },
};

// ---- Claude Desktop (mcp-remote) ----
function claudeDesktopPath(ctx: HarnessContext): string {
    if (process.platform === "darwin") {
        return join(
            ctx.home,
            "Library/Application Support/Claude/claude_desktop_config.json",
        );
    }
    if (process.platform === "win32") {
        return join(
            ctx.env.APPDATA ?? ctx.home,
            "Claude/claude_desktop_config.json",
        );
    }
    return join(ctx.home, ".config/Claude/claude_desktop_config.json");
}

const claudeDesktop: McpClient = {
    id: "claude-desktop",
    label: "Claude Desktop",
    docsUrl: "https://modelcontextprotocol.io",
    useEnvVar: false,
    configPath: claudeDesktopPath,
    write(ctx, servers, apiKey) {
        const path = claudeDesktopPath(ctx);
        const cfg = readJson(path) ?? {};
        const map =
            (cfg.mcpServers as Record<string, unknown> | undefined) ?? {};
        for (const s of servers) {
            map[s.id] = {
                command: "npx",
                args: [
                    "-y",
                    "mcp-remote",
                    s.url,
                    "--header",
                    `Authorization: Bearer ${apiKey}`,
                ],
                [POLLI_MARKER]: true,
            };
        }
        cfg.mcpServers = map;
        writeJson(path, cfg);
    },
    remove(ctx, serverIds) {
        const path = claudeDesktopPath(ctx);
        const cfg = readJson(path);
        if (!cfg) return false;
        const map = cfg.mcpServers as Record<string, unknown> | undefined;
        if (!map) return false;
        let changed = false;
        const filter = serverIds ? new Set(serverIds) : null;
        for (const [k, v] of Object.entries(map)) {
            if (filter && !filter.has(k)) continue;
            if (isPolliEntry(v)) {
                delete map[k];
                changed = true;
            }
        }
        if (changed) writeJson(path, cfg);
        return changed;
    },
    status(ctx) {
        const path = claudeDesktopPath(ctx);
        const cfg = readJson(path);
        const map =
            (cfg?.mcpServers as Record<string, unknown> | undefined) ?? {};
        const installed = Object.entries(map)
            .filter(([, v]) => isPolliEntry(v))
            .map(([k]) => k);
        return { installed, count: installed.length, path };
    },
};

const generic = (
    id: string,
    label: string,
    relPath: string,
    docsUrl: string,
    mapKey = "mcpServers",
) =>
    jsonMapClient({
        id,
        label,
        docsUrl,
        relPath,
        mapKey,
        entry: (s, key) => ({
            url: s.url,
            headers: { Authorization: `Bearer ${key}` },
            [POLLI_MARKER]: true,
        }),
    });

export const MCP_CLIENTS: McpClient[] = [
    claudeCode,
    codex,
    vscode,
    cursor,
    opencode,
    gemini,
    {
        ...generic(
            "copilot-cli",
            "Copilot CLI",
            ".copilot/mcp.json",
            "https://docs.github.com/copilot",
        ),
        cli: "copilot",
    },
    generic(
        "windsurf",
        "Windsurf",
        ".codeium/windsurf/mcp_config.json",
        "https://docs.devin.ai/desktop/cascade/mcp",
    ),
    generic(
        "cline",
        "Cline",
        ".config/cline/mcp_settings.json",
        "https://docs.cline.bot/mcp/configuring-mcp-servers",
    ),
    generic(
        "amp",
        "Amp",
        ".config/amp/mcp.json",
        "https://ampcode.com/docs/customize/mcp",
    ),
    generic(
        "kiro",
        "Kiro",
        ".kiro/settings/mcp.json",
        "https://kiro.dev/docs/mcp/configuration/",
    ),
    generic(
        "zed",
        "Zed",
        ".config/zed/settings.json",
        "https://zed.dev/docs/ai/mcp",
    ),
    generic(
        "warp",
        "Warp",
        ".warp/mcp.json",
        "https://docs.warp.dev/knowledge-and-collaboration/mcp",
    ),
    claudeDesktop,
];

export function getClient(id: string): McpClient | undefined {
    const needle = id.toLowerCase();
    return MCP_CLIENTS.find(
        (c) =>
            c.id === needle ||
            c.label.toLowerCase().replace(/\s+/g, "-") === needle,
    );
}

export function installIntoClient(
    client: McpClient,
    ctx: HarnessContext,
    servers: CatalogServer[],
    apiKey: string,
): { via: "cli" | "file"; path: string } {
    if (client.tryCliAdd?.(ctx, servers, apiKey)) {
        // Still ensure env helper files exist for env-var clients.
        if (client.useEnvVar) client.write(ctx, servers, apiKey);
        return { via: "cli", path: client.configPath(ctx) };
    }
    client.write(ctx, servers, apiKey);
    return { via: "file", path: client.configPath(ctx) };
}
