import { spawnSync } from "node:child_process";
import { readTextIfExists, writeTextAtomic } from "./fs.js";

/** Parse a JSON config file, or return null when it does not exist yet. */
export const readJsonIfExists = <T>(path: string): T | null => {
    const text = readTextIfExists(path);
    if (text === null) return null;
    try {
        return JSON.parse(text) as T;
    } catch {
        throw new Error(
            `${path} is not valid JSON. Fix or remove the file and retry.`,
        );
    }
};

/** Serialize and write a JSON config atomically with owner-only permissions. */
export const writeJsonAtomic = (path: string, value: unknown) =>
    writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`, 0o600);

/** True when `command` is runnable from PATH, so harnesses can offer install help. */
export const isInstalled = (command: string): boolean => {
    try {
        return (
            spawnSync(command, ["--version"], { stdio: "ignore" }).status === 0
        );
    } catch {
        return false;
    }
};
