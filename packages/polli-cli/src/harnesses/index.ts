import { dsh } from "./dsh.js";
import { openclaw } from "./openclaw.js";
import type { HarnessAdapter } from "./types.js";

export const HARNESSES: HarnessAdapter[] = [dsh, openclaw];
