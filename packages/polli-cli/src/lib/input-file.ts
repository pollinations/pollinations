import { statSync } from "node:fs";
import { fail } from "./output.js";

/**
 * Fail with a CLI error unless `path` is an existing regular file, so a
 * missing path or a directory never reaches a read. Returns the file size.
 */
export const requireFile = (path: string): number => {
    const stats = statSync(path, { throwIfNoEntry: false });
    if (!stats) return fail(`File not found: ${path}`);
    if (!stats.isFile()) return fail(`Not a file: ${path}`);
    return stats.size;
};
