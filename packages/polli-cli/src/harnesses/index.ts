import { dsh } from "./dsh.js";
import { prime } from "./prime.js";
import type { HarnessAdapter } from "./types.js";

export const HARNESSES: HarnessAdapter[] = [dsh, prime];
