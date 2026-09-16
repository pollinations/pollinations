import { ampAdapter } from "./amp.js";
import { claudeCodeAdapter } from "./claude-code.js";
import { claudeDesktopAdapter } from "./claude-desktop.js";
import { clineAdapter } from "./cline.js";
import { codexAdapter } from "./codex.js";
import { copilotCliAdapter } from "./copilot-cli.js";
import { cursorAdapter } from "./cursor.js";
import { geminiAdapter } from "./gemini.js";
import { kiroAdapter } from "./kiro.js";
import { opencodeAdapter } from "./opencode.js";
import type { McpClientAdapter } from "./types.js";
import { vscodeAdapter } from "./vscode.js";
import { windsurfAdapter } from "./windsurf.js";
import { zedAdapter } from "./zed.js";

/**
 * Quest priority order: the most-used coding agents first. Warp is covered
 * by the claude-code adapter — the Warp app auto-discovers ~/.claude.json.
 */
export const mcpClientAdapters: McpClientAdapter[] = [
    claudeCodeAdapter,
    codexAdapter,
    vscodeAdapter,
    cursorAdapter,
    opencodeAdapter,
    geminiAdapter,
    copilotCliAdapter,
    windsurfAdapter,
    clineAdapter,
    ampAdapter,
    kiroAdapter,
    zedAdapter,
    claudeDesktopAdapter,
];

export const findMcpClientAdapter = (
    id: string,
): McpClientAdapter | undefined =>
    mcpClientAdapters.find((adapter) => adapter.id === id);
