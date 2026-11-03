import { mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { fail } from "./output.js";

/**
 * Fail with a CLI error if `path` is an existing directory, then make sure its
 * parent exists. The output-side twin of `requireFile`.
 *
 * Call this before a paid request runs: generation is billed before the
 * response is saved, so a destination that cannot hold a file has to be
 * rejected here rather than at `writeFileSync`. Creating the parent directory
 * alone was not enough — an existing directory at the output path itself
 * slipped through and failed only after the request had been paid for.
 */
export const prepareOutputPath = (path: string): void => {
    const stats = statSync(path, { throwIfNoEntry: false });
    if (stats?.isDirectory())
        fail(`Cannot write to ${path}: it is a directory, not a file`);
    mkdirSync(dirname(path), { recursive: true });
};
