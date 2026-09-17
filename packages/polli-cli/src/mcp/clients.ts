import { join } from "node:path";
import JSON5 from "json5";
import {
    readTextIfExists,
    resolveHomePath,
    writeTextAtomic,
} from "../harnesses/fs.js";
import type { HarnessContext } from "../harnesses/types.js";
import { BASE_URL } from "../lib/config.js";
import type { CatalogServer } from "./catalog.js";

// Every client config is JSON-ish, but VS Code/Cursor etc allow comments. Use JSON5 where needed.
// Helpers to mark Pollinations entries: we tag each server entry with a sentinel so removal is safe.

const POLLI_MARKER = "__polli";
const POLLI_KEY_ENV_PREFIX = "POLLI_MCP";

export interface McpClient {
    id: string;
    label: string;
    description: string;
    // config file path resolver
    configPath(ctx: HarnessContext): string;
    // whether this client expects env var reference instead of literal header
    useEnvVar: boolean;
    // optional command to prefer (e.g. "claude mcp add", "codex mcp add")
    addCommand?: string;
    docsUrl: string;
    // read/write/status
    read(ctx: HarnessContext): Record<string, unknown> | null;
    write(ctx: HarnessContext, servers: CatalogServer[], apiKey: string): void;
    remove(ctx: HarnessContext, serverIds?: string[]): boolean;
    status(ctx: HarnessContext): {
        installed: string[];
        count: number;
        path: string;
    };
}

function keyEnvVar(clientId: string): string {
    return `${POLLI_KEY_ENV_PREFIX}_${clientId.toUpperCase().replace(/-/g, "_")}_API_KEY`;
}

function isPolliEntry(entry: unknown): boolean {
    if (!entry || typeof entry !== "object") return false;
    const obj = entry as Record<string, unknown>;
    // check marker or URL pattern
    if (obj[POLLI_MARKER] === true) return true;
    const url =
        (obj.url as string) ??
        (obj as unknown as { command?: string })?.command ??
        "";
    if (typeof url === "string" && url.includes("gen.pollinations.ai/mcp"))
        return true;
    // also check headers contain pollinations URL indirectly
    return false;
}

// ---------- generic JSON helpers ----------
function readJson(
    ctx: HarnessContext,
    path: string,
): Record<string, unknown> | null {
    const text = readTextIfExists(path);
    if (text === null) return null;
    try {
        const parsed = JSON5.parse(text);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
            return parsed as Record<string, unknown>;
    } catch {
        throw new Error(`Could not parse config at ${path}`);
    }
    throw new Error(`Config at ${path} must contain an object`);
}

function writeJson(path: string, data: unknown) {
    writeTextAtomic(path, `${JSON.stringify(data, null, 2)}\n`, 0o600);
}

// ---------- Claude Code ----------
function claudeCodePath(ctx: HarnessContext): string {
    // Claude Code stores mcpServers in ~/.claude.json (global) and ./.mcp.json (project). We use global.
    if (ctx.env.CLAUDE_CONFIG?.trim())
        return resolveHomePath(ctx.home, ctx.env.CLAUDE_CONFIG);
    return join(ctx.home, ".claude.json");
}

const claudeCode: McpClient = {
    id: "claude-code",
    label: "Claude Code",
    description: "Anthropic Claude Code (claude mcp add --transport http)",
    useEnvVar: false,
    addCommand: "claude",
    docsUrl: "https://code.claude.com/docs/en/mcp",
    configPath: claudeCodePath,
    read(ctx) {
        return readJson(ctx, claudeCodePath(ctx));
    },
    write(ctx, servers, apiKey) {
        const path = claudeCodePath(ctx);
        const cfg = readJson(ctx, path) ?? {};
        const mcpServers =
            (cfg.mcpServers as Record<string, unknown> | undefined) ?? {};
        for (const s of servers) {
            mcpServers[s.id] = {
                type: "http",
                url: s.url,
                headers: { Authorization: `Bearer ${apiKey}` },
                [POLLI_MARKER]: true,
            };
        }
        cfg.mcpServers = mcpServers;
        writeJson(path, cfg);
    },
    remove(ctx, serverIds) {
        const path = claudeCodePath(ctx);
        const cfg = readJson(ctx, path);
        if (!cfg) return false;
        const mcpServers = cfg.mcpServers as
            | Record<string, unknown>
            | undefined;
        if (!mcpServers) return false;
        let changed = false;
        const filter = serverIds ? new Set(serverIds) : null;
        for (const [k, v] of Object.entries(mcpServers)) {
            const shouldRemove = filter ? filter.has(k) : isPolliEntry(v);
            // only remove if it is polli-owned
            if (shouldRemove && isPolliEntry(v)) {
                delete mcpServers[k];
                changed = true;
            }
        }
        if (changed) {
            if (Object.keys(mcpServers).length === 0)
                delete (cfg as Record<string, unknown>).mcpServers;
            writeJson(path, cfg);
        }
        return changed;
    },
    status(ctx) {
        const path = claudeCodePath(ctx);
        const cfg = readJson(ctx, path);
        const mcpServers =
            (cfg?.mcpServers as Record<string, unknown> | undefined) ?? {};
        const installed = Object.entries(mcpServers)
            .filter(([, v]) => isPolliEntry(v))
            .map(([k]) => k);
        return { installed, count: installed.length, path };
    },
};

// ---------- Codex CLI ----------
function codexPath(ctx: HarnessContext): string {
    if (ctx.env.CODEX_HOME?.trim())
        return join(
            resolveHomePath(ctx.home, ctx.env.CODEX_HOME),
            "config.toml",
        );
    return join(ctx.home, ".codex", "config.toml");
}

// Codex uses TOML; simplest is to write JSON fallback? But spec says prefer bearer_token_env_var.
// Implement minimal TOML handling via regex - we treat file as text and manage mcp_servers section.
const codex: McpClient = {
    id: "codex",
    label: "Codex CLI",
    description: "OpenAI Codex (codex mcp add --url --bearer-token-env-var)",
    useEnvVar: true,
    addCommand: "codex",
    docsUrl: "https://learn.chatgpt.com/docs/extend/mcp?surface=cli",
    configPath: codexPath,
    read(ctx) {
        const text = readTextIfExists(codexPath(ctx));
        if (text === null) return null;
        // return raw text wrapper
        return { _raw: text };
    },
    write(ctx, servers, _apiKey) {
        const path = codexPath(ctx);
        const envVar = keyEnvVar("codex");
        let text = readTextIfExists(path) ?? "";
        // For each server, ensure [mcp_servers.<id>] block exists
        for (const s of servers) {
            const block = `\n[mcp_servers.${s.id}]\nurl = "${s.url}"\nbearer_token_env_var = "${envVar}"\n# ${POLLI_MARKER}\n`;
            const regex = new RegExp(`\\[mcp_servers\\.${s.id}\\][^\\[]*`, "m");
            if (regex.test(text)) {
                text = text.replace(regex, `${block.trim()}\n`);
            } else {
                text = text.trimEnd() + block;
            }
        }
        writeTextAtomic(path, text.endsWith("\n") ? text : `${text}\n`, 0o600);
        // also store actual key in pollinations env helper file for user to source
        const keyFile = join(ctx.home, ".pollinations", "mcp-codex.env");
        writeTextAtomic(keyFile, `${envVar}=${_apiKey}\n`, 0o600);
    },
    remove(ctx, serverIds) {
        const path = codexPath(ctx);
        const text = readTextIfExists(path);
        if (text === null) return false;
        let changed = false;
        let next = text;
        const ids = serverIds ?? [];
        const removeId = (id: string) => {
            const re = new RegExp(`\\n\\[mcp_servers\\.${id}\\][^\\[]*`, "m");
            if (re.test(next)) {
                next = next.replace(re, "\n");
                changed = true;
            }
        };
        if (ids.length > 0) ids.forEach(removeId);
        else {
            // remove all polli-marked blocks (those containing POLLI_MARKER comment or pollinations URL)
            const polliRe =
                /\n\[mcp_servers\.[^\]]+\][^[]*gen\.pollinations\.ai\/mcp[^[]*/g;
            const matches = [...next.matchAll(polliRe)];
            for (const m of matches) {
                next = next.replace(m[0], "\n");
                changed = true;
            }
            // also remove any marked with comment
            const markedRe = new RegExp(
                `\\n\\[mcp_servers\\.[^\\]]+\\][^\\[]*# ${POLLI_MARKER}[^\\[]*`,
                "g",
            );
            const matches2 = [...next.matchAll(markedRe)];
            for (const m of matches2) {
                next = next.replace(m[0], "\n");
                changed = true;
            }
        }
        if (changed) writeTextAtomic(path, next, 0o600);
        return changed;
    },
    status(ctx) {
        const path = codexPath(ctx);
        const text = readTextIfExists(path) ?? "";
        const installed: string[] = [];
        const re = /\[mcp_servers\.([^\]]+)\][^[]*gen\.pollinations\.ai\/mcp/g;
        for (const m of text.matchAll(re)) installed.push(m[1]);
        return { installed, count: installed.length, path };
    },
};

// ---------- VS Code / Copilot ----------
function vscodePath(ctx: HarnessContext): string {
    // Global VS Code settings location differs per OS; use Code/User/settings.json and .vscode/mcp.json
    // We manage the workspace .vscode/mcp.json if present, else global settings.
    const globalPath =
        process.platform === "darwin"
            ? join(
                  ctx.home,
                  "Library",
                  "Application Support",
                  "Code",
                  "User",
                  "settings.json",
              )
            : process.platform === "win32"
              ? join(
                    ctx.env.APPDATA ?? ctx.home,
                    "Code",
                    "User",
                    "settings.json",
                )
              : join(ctx.home, ".config", "Code", "User", "settings.json");
    const workspace = join(process.cwd(), ".vscode", "mcp.json");
    // prefer workspace if exists, else global
    const workspaceExists = readTextIfExists(workspace) !== null;
    if (workspaceExists) return workspace;
    if (ctx.env.VSCODE_MCP_PATH?.trim())
        return resolveHomePath(ctx.home, ctx.env.VSCODE_MCP_PATH);
    return globalPath;
}

const vscode: McpClient = {
    id: "vscode",
    label: "VS Code / Copilot",
    description: "VS Code MCP (code --add-mcp or mcp.json with inputs)",
    useEnvVar: true,
    addCommand: "code",
    docsUrl:
        "https://code.visualstudio.com/docs/copilot/customization/mcp-servers",
    configPath: vscodePath,
    read(ctx) {
        const p = vscodePath(ctx);
        return readJson(ctx, p);
    },
    write(ctx, servers, _apiKey) {
        const path = vscodePath(ctx);
        const isWorkspace = path.endsWith(".vscode/mcp.json");
        const cfg = readJson(ctx, path) ?? {};
        if (isWorkspace) {
            // workspace mcp.json structure: { servers: { id: { url, headers } }, inputs: [...] }
            const mcpServers =
                (cfg.servers as Record<string, unknown> | undefined) ?? {};
            const inputs = (cfg.inputs as unknown[] | undefined) ?? [];
            // add input for key if not exists
            const inputId = "polli-mcp-key";
            const hasInput = inputs.some(
                (i) =>
                    typeof i === "object" &&
                    i !== null &&
                    (i as Record<string, unknown>).id === inputId,
            );
            if (!hasInput) {
                inputs.push({
                    id: inputId,
                    type: "promptString",
                    description: "Pollinations API key for MCP servers",
                    password: true,
                });
                cfg.inputs = inputs;
            }
            for (const s of servers) {
                mcpServers[s.id] = {
                    url: s.url,
                    // biome-ignore lint/suspicious/noTemplateCurlyInString: VS Code input interpolation syntax
                    headers: { Authorization: "Bearer ${input:polli-mcp-key}" },
                    [POLLI_MARKER]: true,
                };
            }
            cfg.servers = mcpServers;
            writeJson(path, cfg);
        } else {
            // global settings.json: mcp.servers
            const mcp = (cfg.mcp as Record<string, unknown> | undefined) ?? {};
            const mcpServers =
                (mcp.servers as Record<string, unknown> | undefined) ?? {};
            const inputs =
                (cfg["mcp.inputs"] as unknown[] | undefined) ??
                (mcp.inputs as unknown[] | undefined) ??
                [];
            const inputId = "polli-mcp-key";
            const hasInput =
                Array.isArray(inputs) &&
                inputs.some(
                    (i) =>
                        typeof i === "object" &&
                        i !== null &&
                        (i as Record<string, unknown>).id === inputId,
                );
            if (!hasInput) {
                const newInputs = [
                    ...(Array.isArray(inputs) ? inputs : []),
                    {
                        id: inputId,
                        type: "promptString",
                        description: "Pollinations API key",
                        password: true,
                    },
                ];
                // VS Code expects inputs at top-level "mcp.inputs" or inside mcp.inputs
                if (cfg["mcp.inputs"] !== undefined)
                    cfg["mcp.inputs"] = newInputs;
                else mcp.inputs = newInputs;
            }
            for (const s of servers) {
                mcpServers[s.id] = {
                    url: s.url,
                    // biome-ignore lint/suspicious/noTemplateCurlyInString: VS Code input interpolation syntax
                    headers: { Authorization: "Bearer ${input:polli-mcp-key}" },
                    [POLLI_MARKER]: true,
                };
            }
            mcp.servers = mcpServers;
            cfg.mcp = mcp;
            writeJson(path, cfg);
        }
        // store key hint
        const keyFile = join(ctx.home, ".pollinations", "mcp-vscode.env");
        writeTextAtomic(
            keyFile,
            `# VS Code uses inputs prompt; enter this key when prompted\n${_apiKey}\n`,
            0o600,
        );
    },
    remove(ctx, serverIds) {
        const path = vscodePath(ctx);
        const cfg = readJson(ctx, path);
        if (!cfg) return false;
        let changed = false;
        const isWorkspace = path.endsWith(".vscode/mcp.json");
        if (isWorkspace) {
            const mcpServers = cfg.servers as
                | Record<string, unknown>
                | undefined;
            if (!mcpServers) return false;
            const filter = serverIds ? new Set(serverIds) : null;
            for (const [k, v] of Object.entries(mcpServers)) {
                const should = filter ? filter.has(k) : isPolliEntry(v);
                if (should && isPolliEntry(v)) {
                    delete mcpServers[k];
                    changed = true;
                }
            }
            if (changed) writeJson(path, cfg);
        } else {
            const mcp = cfg.mcp as Record<string, unknown> | undefined;
            const mcpServers = mcp?.servers as
                | Record<string, unknown>
                | undefined;
            if (!mcpServers) return false;
            const filter = serverIds ? new Set(serverIds) : null;
            for (const [k, v] of Object.entries(mcpServers)) {
                const should = filter ? filter.has(k) : isPolliEntry(v);
                if (should && isPolliEntry(v)) {
                    delete mcpServers[k];
                    changed = true;
                }
            }
            if (changed) writeJson(path, cfg);
        }
        return changed;
    },
    status(ctx) {
        const path = vscodePath(ctx);
        const cfg = readJson(ctx, path);
        let installed: string[] = [];
        if (!cfg) return { installed, count: 0, path };
        const isWorkspace = path.endsWith(".vscode/mcp.json");
        const mcpServers = isWorkspace
            ? (cfg.servers as Record<string, unknown> | undefined)
            : ((cfg.mcp as Record<string, unknown> | undefined)?.servers as
                  | Record<string, unknown>
                  | undefined);
        if (mcpServers)
            installed = Object.entries(mcpServers)
                .filter(([, v]) => isPolliEntry(v))
                .map(([k]) => k);
        return { installed, count: installed.length, path };
    },
};

// ---------- Cursor ----------
function cursorPath(ctx: HarnessContext): string {
    if (ctx.env.CURSOR_MCP_PATH?.trim())
        return resolveHomePath(ctx.home, ctx.env.CURSOR_MCP_PATH);
    return join(ctx.home, ".cursor", "mcp.json");
}
const cursor: McpClient = {
    id: "cursor",
    label: "Cursor",
    description: "Cursor mcp.json + deeplink",
    useEnvVar: false,
    docsUrl: "https://cursor.com/docs/context/mcp/install-links",
    configPath: cursorPath,
    read(ctx) {
        return readJson(ctx, cursorPath(ctx));
    },
    write(ctx, servers, apiKey) {
        const path = cursorPath(ctx);
        const cfg = readJson(ctx, path) ?? {};
        const mcpServers =
            (cfg.mcpServers as Record<string, unknown> | undefined) ?? {};
        for (const s of servers) {
            mcpServers[s.id] = {
                url: s.url,
                headers: { Authorization: `Bearer ${apiKey}` },
                [POLLI_MARKER]: true,
            };
        }
        cfg.mcpServers = mcpServers;
        writeJson(path, cfg);
    },
    remove(ctx, serverIds) {
        const path = cursorPath(ctx);
        const cfg = readJson(ctx, path);
        if (!cfg) return false;
        const mcpServers = cfg.mcpServers as
            | Record<string, unknown>
            | undefined;
        if (!mcpServers) return false;
        let changed = false;
        const filter = serverIds ? new Set(serverIds) : null;
        for (const [k, v] of Object.entries(mcpServers)) {
            const should = filter ? filter.has(k) : isPolliEntry(v);
            if (should && isPolliEntry(v)) {
                delete mcpServers[k];
                changed = true;
            }
        }
        if (changed) writeJson(path, cfg);
        return changed;
    },
    status(ctx) {
        const path = cursorPath(ctx);
        const cfg = readJson(ctx, path);
        const mcpServers =
            (cfg?.mcpServers as Record<string, unknown> | undefined) ?? {};
        const installed = Object.entries(mcpServers)
            .filter(([, v]) => isPolliEntry(v))
            .map(([k]) => k);
        return { installed, count: installed.length, path };
    },
};

// ---------- OpenCode MCP ----------
function openCodeMcpPath(ctx: HarnessContext): string {
    if (ctx.env.OPENCODE_CONFIG?.trim())
        return resolveHomePath(ctx.home, ctx.env.OPENCODE_CONFIG);
    const dir = ctx.env.OPENCODE_CONFIG_DIR?.trim()
        ? resolveHomePath(ctx.home, ctx.env.OPENCODE_CONFIG_DIR)
        : join(ctx.home, ".config", "opencode");
    return (
        ["opencode.jsonc", "opencode.json", "config.json"]
            .map((n) => join(dir, n))
            .find((p) => readTextIfExists(p) !== null) ??
        join(dir, "opencode.json")
    );
}
const opencodeMcp: McpClient = {
    id: "opencode",
    label: "OpenCode",
    description: "OpenCode mcp block (opencode.ai/docs/mcp-servers)",
    useEnvVar: false,
    docsUrl: "https://opencode.ai/docs/mcp-servers/",
    configPath: openCodeMcpPath,
    read(ctx) {
        return readJson(ctx, openCodeMcpPath(ctx));
    },
    write(ctx, servers, apiKey) {
        const path = openCodeMcpPath(ctx);
        const cfg = readJson(ctx, path) ?? {};
        if (!cfg.$schema) cfg.$schema = "https://opencode.ai/config.json";
        const mcp = (cfg.mcp as Record<string, unknown> | undefined) ?? {};
        for (const s of servers) {
            mcp[s.id] = {
                type: "remote",
                url: s.url,
                headers: { Authorization: `Bearer ${apiKey}` },
                [POLLI_MARKER]: true,
            };
        }
        cfg.mcp = mcp;
        writeJson(path, cfg);
    },
    remove(ctx, serverIds) {
        const path = openCodeMcpPath(ctx);
        const cfg = readJson(ctx, path);
        if (!cfg) return false;
        const mcp = cfg.mcp as Record<string, unknown> | undefined;
        if (!mcp) return false;
        let changed = false;
        const filter = serverIds ? new Set(serverIds) : null;
        for (const [k, v] of Object.entries(mcp)) {
            const should = filter ? filter.has(k) : isPolliEntry(v);
            if (should && isPolliEntry(v)) {
                delete mcp[k];
                changed = true;
            }
        }
        if (changed) {
            if (Object.keys(mcp).length === 0)
                delete (cfg as Record<string, unknown>).mcp;
            writeJson(path, cfg);
        }
        return changed;
    },
    status(ctx) {
        const path = openCodeMcpPath(ctx);
        const cfg = readJson(ctx, path);
        const mcp = (cfg?.mcp as Record<string, unknown> | undefined) ?? {};
        const installed = Object.entries(mcp)
            .filter(([, v]) => isPolliEntry(v))
            .map(([k]) => k);
        return { installed, count: installed.length, path };
    },
};

// ---------- Gemini CLI ----------
function geminiPath(ctx: HarnessContext): string {
    if (ctx.env.GEMINI_MCP_PATH?.trim())
        return resolveHomePath(ctx.home, ctx.env.GEMINI_MCP_PATH);
    return join(ctx.home, ".gemini", "settings.json");
}
const gemini: McpClient = {
    id: "gemini",
    label: "Gemini CLI",
    description: "Gemini CLI (gemini mcp add)",
    useEnvVar: false,
    addCommand: "gemini",
    docsUrl: "https://geminicli.com/docs/tools/mcp-server/",
    configPath: geminiPath,
    read(ctx) {
        return readJson(ctx, geminiPath(ctx));
    },
    write(ctx, servers, apiKey) {
        const path = geminiPath(ctx);
        const cfg = readJson(ctx, path) ?? {};
        const mcpServers =
            (cfg.mcpServers as Record<string, unknown> | undefined) ?? {};
        for (const s of servers) {
            mcpServers[s.id] = {
                httpUrl: s.url,
                headers: { Authorization: `Bearer ${apiKey}` },
                [POLLI_MARKER]: true,
            };
        }
        cfg.mcpServers = mcpServers;
        writeJson(path, cfg);
    },
    remove(ctx, serverIds) {
        const path = geminiPath(ctx);
        const cfg = readJson(ctx, path);
        if (!cfg) return false;
        const mcpServers = cfg.mcpServers as
            | Record<string, unknown>
            | undefined;
        if (!mcpServers) return false;
        let changed = false;
        const filter = serverIds ? new Set(serverIds) : null;
        for (const [k, v] of Object.entries(mcpServers)) {
            const should = filter
                ? filter.has(k)
                : isPolliEntry(v) ||
                  (v as Record<string, unknown>).httpUrl ===
                      `https://gen.pollinations.ai/mcp/${k}`;
            if (should && isPolliEntry(v)) {
                delete mcpServers[k];
                changed = true;
            }
            // fallback: check URL
            if (
                filter &&
                filter.has(k) &&
                (v as Record<string, unknown>).httpUrl &&
                String((v as Record<string, unknown>).httpUrl).includes(
                    "gen.pollinations.ai/mcp",
                )
            ) {
                delete mcpServers[k];
                changed = true;
            }
        }
        if (changed) writeJson(path, cfg);
        return changed;
    },
    status(ctx) {
        const path = geminiPath(ctx);
        const cfg = readJson(ctx, path);
        const mcpServers =
            (cfg?.mcpServers as Record<string, unknown> | undefined) ?? {};
        const installed = Object.entries(mcpServers)
            .filter(
                ([, v]) =>
                    isPolliEntry(v) ||
                    String(
                        (v as Record<string, unknown>).httpUrl ?? "",
                    ).includes("gen.pollinations.ai/mcp"),
            )
            .map(([k]) => k);
        return { installed, count: installed.length, path };
    },
};

// ---------- Generic clients (Windsurf, Cline, Zed, etc.) ----------
function genericJsonClient(
    id: string,
    label: string,
    relPath: string,
    docsUrl: string,
    key: string,
): McpClient {
    const cfgKey = key;
    const fn = (ctx: HarnessContext) => join(ctx.home, relPath);
    return {
        id,
        label,
        description: `${label} mcp config`,
        useEnvVar: false,
        docsUrl,
        configPath: fn,
        read(ctx) {
            return readJson(ctx, fn(ctx));
        },
        write(ctx, servers, apiKey) {
            const path = fn(ctx);
            const cfg = readJson(ctx, path) ?? {};
            const mcpServers =
                (cfg[cfgKey] as Record<string, unknown> | undefined) ??
                (cfg.mcpServers as Record<string, unknown> | undefined) ??
                {};
            for (const s of servers) {
                mcpServers[s.id] = {
                    url: s.url,
                    headers: { Authorization: `Bearer ${apiKey}` },
                    [POLLI_MARKER]: true,
                };
            }
            // try to preserve original key
            if (cfg[cfgKey] !== undefined) cfg[cfgKey] = mcpServers;
            else if (cfg.mcpServers !== undefined) cfg.mcpServers = mcpServers;
            else cfg[cfgKey] = mcpServers;
            writeJson(path, cfg);
        },
        remove(ctx, serverIds) {
            const path = fn(ctx);
            const cfg = readJson(ctx, path);
            if (!cfg) return false;
            const target =
                (cfg[cfgKey] as Record<string, unknown> | undefined) ??
                (cfg.mcpServers as Record<string, unknown> | undefined);
            if (!target) return false;
            let changed = false;
            const filter = serverIds ? new Set(serverIds) : null;
            for (const [k, v] of Object.entries(target)) {
                const should = filter ? filter.has(k) : isPolliEntry(v);
                if (should && isPolliEntry(v)) {
                    delete target[k];
                    changed = true;
                }
            }
            if (changed) writeJson(path, cfg);
            return changed;
        },
        status(ctx) {
            const path = fn(ctx);
            const cfg = readJson(ctx, path);
            const target =
                (cfg?.[cfgKey] as Record<string, unknown> | undefined) ??
                (cfg?.mcpServers as Record<string, unknown> | undefined) ??
                {};
            const installed = Object.entries(target)
                .filter(([, v]) => isPolliEntry(v))
                .map(([k]) => k);
            return { installed, count: installed.length, path };
        },
    };
}

// ---------- Claude Desktop (mcp-remote shim) ----------
function claudeDesktopPath(ctx: HarnessContext): string {
    if (process.platform === "darwin")
        return join(
            ctx.home,
            "Library",
            "Application Support",
            "Claude",
            "claude_desktop_config.json",
        );
    if (process.platform === "win32")
        return join(
            ctx.env.APPDATA ?? ctx.home,
            "Claude",
            "claude_desktop_config.json",
        );
    return join(ctx.home, ".config", "Claude", "claude_desktop_config.json");
}
const claudeDesktop: McpClient = {
    id: "claude-desktop",
    label: "Claude Desktop",
    description:
        "Claude Desktop via mcp-remote (headers not supported natively)",
    useEnvVar: false,
    docsUrl: "https://modelcontextprotocol.io",
    configPath: claudeDesktopPath,
    read(ctx) {
        return readJson(ctx, claudeDesktopPath(ctx));
    },
    write(ctx, servers, apiKey) {
        const path = claudeDesktopPath(ctx);
        const cfg = readJson(ctx, path) ?? {};
        const mcpServers =
            (cfg.mcpServers as Record<string, unknown> | undefined) ?? {};
        for (const s of servers) {
            mcpServers[s.id] = {
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
        cfg.mcpServers = mcpServers;
        writeJson(path, cfg);
    },
    remove(ctx, serverIds) {
        const path = claudeDesktopPath(ctx);
        const cfg = readJson(ctx, path);
        if (!cfg) return false;
        const mcpServers = cfg.mcpServers as
            | Record<string, unknown>
            | undefined;
        if (!mcpServers) return false;
        let changed = false;
        const filter = serverIds ? new Set(serverIds) : null;
        for (const [k, v] of Object.entries(mcpServers)) {
            const should = filter
                ? filter.has(k)
                : isPolliEntry(v) ||
                  ((v as Record<string, unknown>).command === "npx" &&
                      Array.isArray((v as Record<string, unknown>).args) &&
                      String((v as Record<string, unknown>).args).includes(
                          "mcp-remote",
                      ));
            if (should) {
                // only remove polli entries (check marker or url)
                const entry = v as Record<string, unknown>;
                const isPolli =
                    isPolliEntry(v) ||
                    (Array.isArray(entry.args) &&
                        entry.args.some((a) =>
                            String(a).includes("gen.pollinations.ai/mcp"),
                        ));
                if (isPolli) {
                    delete mcpServers[k];
                    changed = true;
                }
            }
        }
        if (changed) writeJson(path, cfg);
        return changed;
    },
    status(ctx) {
        const path = claudeDesktopPath(ctx);
        const cfg = readJson(ctx, path);
        const mcpServers =
            (cfg?.mcpServers as Record<string, unknown> | undefined) ?? {};
        const installed = Object.entries(mcpServers)
            .filter(
                ([, v]) =>
                    isPolliEntry(v) ||
                    ((v as Record<string, unknown>).command === "npx" &&
                        String(
                            (v as Record<string, unknown>).args ?? "",
                        ).includes("gen.pollinations.ai/mcp")),
            )
            .map(([k]) => k);
        return { installed, count: installed.length, path };
    },
};

export const MCP_CLIENTS: McpClient[] = [
    claudeCode,
    codex,
    vscode,
    cursor,
    opencodeMcp,
    gemini,
    claudeDesktop,
    genericJsonClient(
        "windsurf",
        "Windsurf",
        ".codeium/windsurf/mcp_config.json",
        "https://docs.devin.ai/desktop/cascade/mcp",
        "mcpServers",
    ),
    genericJsonClient(
        "cline",
        "Cline",
        ".config/cline/mcp_settings.json",
        "https://docs.cline.bot/mcp/configuring-mcp-servers",
        "mcpServers",
    ),
    genericJsonClient(
        "amp",
        "Amp",
        ".config/amp/mcp.json",
        "https://ampcode.com/docs/customize/mcp",
        "mcpServers",
    ),
    genericJsonClient(
        "kiro",
        "Kiro",
        ".kiro/settings/mcp.json",
        "https://kiro.dev/docs/mcp/configuration/",
        "mcpServers",
    ),
    genericJsonClient(
        "zed",
        "Zed",
        ".config/zed/settings.json",
        "https://zed.dev/docs/ai/mcp",
        "mcpServers",
    ),
    genericJsonClient(
        "warp",
        "Warp",
        ".warp/mcp.json",
        "https://docs.warp.dev/knowledge-and-collaboration/mcp",
        "mcpServers",
    ),
    genericJsonClient(
        "copilot-cli",
        "Copilot CLI",
        ".copilot/mcp.json",
        "https://docs.github.com/copilot",
        "mcpServers",
    ),
];

export function getClient(id: string): McpClient | undefined {
    return MCP_CLIENTS.find(
        (c) =>
            c.id === id ||
            c.label.toLowerCase().replace(/\s+/g, "-") === id.toLowerCase(),
    );
}
export function listClients(): string[] {
    return MCP_CLIENTS.map((c) => c.id);
}
