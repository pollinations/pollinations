import { opencodeHarness } from "./opencode.js";
import type { HarnessAdapter } from "./types.js";

const harnesses: HarnessAdapter[] = [opencodeHarness];

export const listHarnesses = (): HarnessAdapter[] => [...harnesses];
