import { dsh } from "./dsh.js";
import { opencode } from "./opencode.js";
import { openclaw } from "./openclaw.js";
import { pi } from "./pi.js";
import { prime } from "./prime.js";
import type { HarnessAdapter } from "./types.js";

export const HARNESSES: HarnessAdapter[] = [dsh, opencode, openclaw, pi, prime];
