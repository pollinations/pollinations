import {
    existsSync,
    mkdirSync,
    readFileSync,
    renameSync,
    statSync,
    unlinkSync,
    writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

/** Resolve a harness path without shell-style expansion or cwd surprises. */
export const resolveHarnessPath = (
    configured: string,
    home: string,
): string => {
    const value = configured.trim();
    if (!value) throw new Error("Harness path must not be empty");
    if (value === "~") return home;
    if (value.startsWith("~/") || value.startsWith("~\\")) {
        return join(home, value.slice(2));
    }
    return resolve(value);
};

export const readTextIfExists = (path: string): string | null =>
    existsSync(path) ? readFileSync(path, "utf-8") : null;

/** Write via temp file + rename so a crash never leaves a half-written config. */
export const writeTextAtomic = (path: string, text: string, mode?: number) => {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const fileMode =
        mode ?? (existsSync(path) ? statSync(path).mode & 0o777 : 0o600);
    const tmp = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
    writeFileSync(tmp, text, { encoding: "utf-8", mode: fileMode });
    renameSync(tmp, path);
};

export const removeIfExists = (path: string) => {
    if (existsSync(path)) unlinkSync(path);
};
