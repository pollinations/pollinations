import { existsSync } from "node:fs";
import { join } from "node:path";
import type { HarnessContext } from "../harnesses/types.js";
import { codex } from "./codex.js";
import { jsonClient, VS_CODE_INPUT_ID } from "./json-config.js";

/** User-scope Claude Code config (~/.claude.json) holds the mcpServers map. */
const claudeCode: McpClient = jsonClient({
    id: "claude-code",
    label: "Claude Code",
    description:
        "Install Pollinations MCP servers into Claude Code (user scope)",
    restartHint: "Restart Claude Code, then run /mcp to check.",
    envelopeKey: "mcpServers",
    urlField: "url",
    typeField: { name: "type", value: "http" },
    secretMode: "literal",
    configPath: (ctx) => join(ctx.home, ".claude.json"),
});

/** Cursor: url without type, literal headers (native format). */
const cursor: McpClient = jsonClient({
    id: "cursor",
    label: "Cursor",
    description: "Install Pollinations MCP servers into Cursor (user scope).",
    restartHint: "Restart Cursor.",
    envelopeKey: "mcpServers",
    urlField: "url",
    secretMode: "literal",
    configPath: (ctx) => join(ctx.home, ".cursor", "mcp.json"),
});

/** Gemini CLI uses httpUrl (not url) inside ~/.gemini/settings.json. */
const gemini: McpClient = jsonClient({
    id: "gemini",
    label: "Gemini CLI",
    description: "Install Pollinations MCP servers into Gemini CLI.",
    restartHint: "Restart Gemini CLI.",
    envelopeKey: "mcpServers",
    urlField: "httpUrl",
    secretMode: "literal",
    configPath: (ctx) => join(ctx.home, ".gemini", "settings.json"),
});

/** Windsurf is the outlier: the URL field is serverUrl. */
const windsurf: McpClient = jsonClient({
    id: "windsurf",
    label: "Windsurf",
    description: "Install Pollinations MCP servers into Windsurf (user scope).",
    restartHint: "Restart Windsurf.",
    envelopeKey: "mcpServers",
    urlField: "serverUrl",
    secretMode: "literal",
    configPath: (ctx) =>
        join(ctx.home, ".codeium", "windsurf", "mcp_config.json"),
});

/** Cline: type must be the camelCase "streamableHttp". */
const cline: McpClient = jsonClient({
    id: "cline",
    label: "Cline",
    description: "Install Pollinations MCP servers into Cline (CLI config).",
    restartHint: "Reload VS Code so Cline re-reads its MCP config.",
    envelopeKey: "mcpServers",
    urlField: "url",
    typeField: { name: "type", value: "streamableHttp" },
    secretMode: "literal",
    configPath: (ctx) => join(ctx.home, ".cline", "mcp.json"),
});

/** OpenCode: nested per-name keys under "mcp" (v1 schema), literal headers. */
const opencodeConfigPath = (ctx: HarnessContext) => {
    if (ctx.env.OPENCODE_CONFIG?.trim()) {
        return ctx.env.OPENCODE_CONFIG.trim().replace(/^~(?=\/|$)/, ctx.home);
    }
    const dir = ctx.env.OPENCODE_CONFIG_DIR?.trim()
        ? ctx.env.OPENCODE_CONFIG_DIR.trim().replace(/^~(?=\/|$)/, ctx.home)
        : join(ctx.home, ".config", "opencode");
    return (
        ["opencode.jsonc", "opencode.json", "config.json"]
            .map((name) => join(dir, name))
            .find((path) => existsSync(path)) ?? join(dir, "opencode.json")
    );
};

const opencode: McpClient = jsonClient({
    id: "opencode",
    label: "OpenCode",
    description:
        "Install Pollinations MCP servers into OpenCode (user config).",
    restartHint: "Restart OpenCode; /mcp lists the installed servers.",
    envelopeKey: "mcp",
    urlField: "url",
    typeField: { name: "type", value: "remote" },
    extraFields: { enabled: true },
    secretMode: "literal",
    configPath: opencodeConfigPath,
});

/** VS Code: project-scoped .vscode/mcp.json with "servers" + prompt inputs. */
const vscode: McpClient = jsonClient({
    id: "vscode",
    label: "VS Code / Copilot",
    description:
        "Install Pollinations MCP servers into the current VS Code workspace (.vscode/mcp.json; override with VSCODE_MCP_CONFIG).",
    restartHint:
        "Run 'MCP: List Servers' in VS Code; paste the key when prompted the first time.",
    envelopeKey: "servers",
    urlField: "url",
    typeField: { name: "type", value: "http" },
    secretMode: "input",
    configPath: (ctx) =>
        ctx.env.VSCODE_MCP_CONFIG?.trim()
            ? ctx.env.VSCODE_MCP_CONFIG.trim().replace(/^~(?=\/|$)/, ctx.home)
            : join(process.cwd(), ".vscode", "mcp.json"),
    finalize: (config) => {
        const inputs = Array.isArray(config.inputs)
            ? config.inputs.filter(
                  (input) =>
                      !(
                          typeof input === "object" &&
                          input !== null &&
                          (input as Record<string, unknown>).id ===
                              VS_CODE_INPUT_ID
                      ),
              )
            : [];
        const serversStr = JSON.stringify(config.servers ?? {});
        const needsInput = serversStr.includes(`\${input:${VS_CODE_INPUT_ID}}`);
        if (needsInput) {
            config.inputs = [
                ...inputs,
                {
                    type: "promptString",
                    id: VS_CODE_INPUT_ID,
                    description: "Pollinations API key",
                    password: true,
                },
            ];
        } else if (inputs.length > 0) {
            config.inputs = inputs;
        } else {
            delete config.inputs;
        }
    },
});

/** Copilot CLI (~/.copilot/mcp-config.json): mcpServers with type http + tools ["*"]. */
const copilotCli: McpClient = jsonClient({
    id: "copilot-cli",
    label: "GitHub Copilot CLI",
    description: "Install Pollinations MCP servers into GitHub Copilot CLI.",
    restartHint: "Restart Copilot CLI, then run 'copilot mcp list' to verify.",
    envelopeKey: "mcpServers",
    urlField: "url",
    typeField: { name: "type", value: "http" },
    extraFields: { tools: ["*"] },
    secretMode: "literal",
    configPath: (ctx) => join(ctx.home, ".copilot", "mcp-config.json"),
});

/** Amp keeps MCP under the literal "amp.mcpServers" key in settings.json. */
const amp: McpClient = jsonClient({
    id: "amp",
    label: "Amp",
    description:
        "Install Pollinations MCP servers into Amp (~/.config/amp/settings.json).",
    restartHint: "Restart Amp.",
    envelopeKey: "amp.mcpServers",
    urlField: "url",
    secretMode: "literal",
    configPath: (ctx) => join(ctx.home, ".config", "amp", "settings.json"),
});

/** Kiro: ~/.kiro/settings/mcp.json, remote entries are {url, headers}. */
const kiro: McpClient = jsonClient({
    id: "kiro",
    label: "Kiro",
    description: "Install Pollinations MCP servers into Kiro.",
    restartHint: "Restart Kiro.",
    envelopeKey: "mcpServers",
    urlField: "url",
    secretMode: "literal",
    configPath: (ctx) => join(ctx.home, ".kiro", "settings", "mcp.json"),
});

/** Zed: context_servers in ~/.config/zed/settings.json, entries are {url, headers}. */
const zed: McpClient = jsonClient({
    id: "zed",
    label: "Zed",
    description: "Install Pollinations MCP servers into Zed.",
    restartHint: "Restart Zed.",
    envelopeKey: "context_servers",
    urlField: "url",
    secretMode: "literal",
    configPath: (ctx) => join(ctx.home, ".config", "zed", "settings.json"),
});

/** Warp file-based config lives at ~/.warp/.mcp.json (note the leading dot). */
const warp: McpClient = jsonClient({
    id: "warp",
    label: "Warp",
    description: "Install Pollinations MCP servers into Warp.",
    restartHint: "Restart Warp.",
    envelopeKey: "mcpServers",
    urlField: "url",
    secretMode: "literal",
    configPath: (ctx) => join(ctx.home, ".warp", ".mcp.json"),
});

import type { McpClient } from "./types.js";

/** Order follows the issue's priority list (row 1, then row 2). */
export const MCP_CLIENTS: McpClient[] = [
    claudeCode,
    codex,
    vscode,
    cursor,
    opencode,
    gemini,
    copilotCli,
    windsurf,
    cline,
    amp,
    kiro,
    zed,
    warp,
];
