import { dsh } from "./dsh.js";
import { openclaw } from "./openclaw.js";
import { opencode } from "./opencode.js";
import { pi } from "./pi.js";
import { prime } from "./prime.js";
import type { HarnessAdapter } from "./types.js";

export const HARNESSES: HarnessAdapter[] = [
    dsh,
    opencode,
    pi,
    prime,
    openclaw,
];
