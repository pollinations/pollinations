import { dsh } from "./dsh.js";
import { opencode } from "./opencode.js";
import type { HarnessAdapter } from "./types.js";

export const HARNESSES: HarnessAdapter[] = [dsh, opencode];
