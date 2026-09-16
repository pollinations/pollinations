import { claudeCodeAdapter } from "./claude-code.js";
import { claudeDesktopAdapter } from "./claude-desktop.js";
import { clineAdapter } from "./cline.js";
import { codexAdapter } from "./codex.js";
import { cursorAdapter } from "./cursor.js";
import { geminiAdapter } from "./gemini.js";
import { kiroAdapter } from "./kiro.js";
import { opencodeAdapter } from "./opencode.js";
import type { McpClientAdapter } from "./types.js";
import { vscodeAdapter } from "./vscode.js";
import { windsurfAdapter } from "./windsurf.js";

/** Quest priority order: the most-used coding agents first. */
export const mcpClientAdapters: McpClientAdapter[] = [
    claudeCodeAdapter,
    codexAdapter,
    vscodeAdapter,
    cursorAdapter,
    opencodeAdapter,
    geminiAdapter,
    claudeDesktopAdapter,
    windsurfAdapter,
    clineAdapter,
    kiroAdapter,
];

export const findMcpClientAdapter = (
    id: string,
): McpClientAdapter | undefined =>
    mcpClientAdapters.find((adapter) => adapter.id === id);
