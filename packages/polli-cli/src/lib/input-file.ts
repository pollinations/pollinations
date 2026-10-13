import { statSync } from "node:fs";
import { fail } from "./output.js";

/**
 * Fail with a CLI error if `path` is missing or a directory, so neither
 * reaches a read. Pipes and devices such as `/dev/stdin` pass. Returns the
 * size, which is 0 for those.
 */
export const requireFile = (path: string): number => {
    const stats = statSync(path, { throwIfNoEntry: false });
    if (!stats) return fail(`File not found: ${path}`);
    if (stats.isDirectory()) return fail(`Not a file: ${path}`);
    return stats.size;
};
