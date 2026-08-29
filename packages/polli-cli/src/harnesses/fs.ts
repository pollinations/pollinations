import {
    existsSync,
    mkdirSync,
    readFileSync,
    renameSync,
    statSync,
    unlinkSync,
    writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";

export const readTextIfExists = (path: string): string | null =>
    existsSync(path) ? readFileSync(path, "utf-8") : null;

/** Write via temp file + rename so a crash never leaves a half-written config. */
export const writeTextAtomic = (path: string, text: string, mode?: number) => {
    mkdirSync(dirname(path), { recursive: true });
    const fileMode =
        mode ?? (existsSync(path) ? statSync(path).mode & 0o777 : 0o644);
    const tmp = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
    writeFileSync(tmp, text, { encoding: "utf-8", mode: fileMode });
    renameSync(tmp, path);
};

export const removeIfExists = (path: string) => {
    if (existsSync(path)) unlinkSync(path);
};
