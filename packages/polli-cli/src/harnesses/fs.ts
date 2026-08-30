import { randomUUID } from "node:crypto";
import {
    chmodSync,
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
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const fileMode =
        mode ?? (existsSync(path) ? statSync(path).mode & 0o777 : 0o600);
    // A process-id-only name lets concurrent CLI invocations overwrite one
    // another's temporary file. Keep the temp file beside its destination so
    // rename remains atomic, but give every write its own collision-resistant
    // name.
    const tmp = join(
        dirname(path),
        `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`,
    );
    try {
        writeFileSync(tmp, text, { encoding: "utf-8", mode: fileMode });
        renameSync(tmp, path);
        // The mode option is ignored when a file already exists on some
        // platforms. Apply it after the atomic rename so config files keep
        // their intended permissions consistently on Windows and Unix.
        chmodSync(path, fileMode);
    } catch (error) {
        // A failed write must not leave credential/config fragments behind.
        try {
            if (existsSync(tmp)) unlinkSync(tmp);
        } catch {
            // Preserve the original error; callers handle rollback/reporting.
        }
        throw error;
    }
};

export const removeIfExists = (path: string) => {
    if (existsSync(path)) unlinkSync(path);
};
