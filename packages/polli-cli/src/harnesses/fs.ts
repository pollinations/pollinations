import {
    accessSync,
    constants,
    existsSync,
    mkdirSync,
    readFileSync,
    renameSync,
    statSync,
    unlinkSync,
    writeFileSync,
} from "node:fs";
import { basename, delimiter, dirname, join } from "node:path";

const isExecutable = (path: string) => {
    try {
        accessSync(path, constants.X_OK);
        return true;
    } catch {
        return false;
    }
};

/** Whether a command can be launched from PATH or a known fallback location. */
export const commandExists = (
    command: string,
    env: NodeJS.ProcessEnv,
    fallbacks: string[] = [],
) => {
    const extensions =
        process.platform === "win32"
            ? (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";")
            : [""];
    const candidates = (env.PATH ?? env.Path ?? "")
        .split(delimiter)
        .filter(Boolean)
        .flatMap((dir) => extensions.map((extension) => join(dir, `${command}${extension}`)));
    return [...candidates, ...fallbacks].some(isExecutable);
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
