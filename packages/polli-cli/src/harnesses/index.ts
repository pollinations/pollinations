import { dsh } from "./dsh.js";
import { pi } from "./pi.js";
import type { HarnessAdapter } from "./types.js";

export const HARNESSES: HarnessAdapter[] = [dsh, pi];
