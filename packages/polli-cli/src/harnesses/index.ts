import { dsh } from "./dsh.js";
import type { HarnessProfile } from "./types.js";

export const HARNESSES: HarnessProfile[] = [dsh];

export const findHarness = (id: string): HarnessProfile | undefined =>
    HARNESSES.find((harness) => harness.id === id);
