import { bloom } from "./bloom.js";
import { claudeCode } from "./claude-code.js";
import { codex } from "./codex.js";
import { dsh } from "./dsh.js";
import { openclaw } from "./openclaw.js";
import { opencode } from "./opencode.js";
import { pi } from "./pi.js";
import { prime } from "./prime.js";
import type { HarnessAdapter } from "./types.js";

export const HARNESSES: HarnessAdapter[] = [
    bloom,
    claudeCode,
    codex,
    dsh,
    opencode,
    openclaw,
    pi,
    prime,
];
