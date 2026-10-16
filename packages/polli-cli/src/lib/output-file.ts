import { mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { fail } from "./output.js";

/** Validate the output before paid generation without creating or truncating it. */
export const prepareOutputFile = (path: string): void => {
    if (statSync(path, { throwIfNoEntry: false })?.isDirectory()) {
        fail(`Not a file: ${path}`);
    }
    mkdirSync(dirname(path), { recursive: true });
};
