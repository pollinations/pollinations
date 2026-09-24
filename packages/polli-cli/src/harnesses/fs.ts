import { spawnSync } from "node:child_process";
import {
    accessSync,
    constants,
    existsSync,
    mkdirSync,
    readFileSync,
    renameSync,
    rmdirSync,
    statSync,
    unlinkSync,
    writeFileSync,
} from "node:fs";
import { basename, delimiter, dirname, join, resolve } from "node:path";

/** Resolve a configured path, expanding only the current user's tilde. */
export const resolveHomePath = (home: string, path: string) =>
    resolve(
        path === "~"
            ? home
            : path.startsWith("~/") || path.startsWith("~\\")
              ? join(home, path.slice(2))
              : path,
    );

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
        .flatMap((dir) =>
            extensions.map((extension) => join(dir, `${command}${extension}`)),
        );
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

/**
 * Launch an installed command. npm exposes global CLIs on Windows as .cmd
 * shims, which CreateProcess cannot run directly - they need cmd.exe.
 */
export const spawnCommand = (
    command: string,
    args: string[],
    options: Parameters<typeof spawnSync>[2] = {},
): ReturnType<typeof spawnSync> & { stdout?: string; stderr?: string } =>
    (process.platform === "win32"
        ? spawnSync(`"${command}"`, args, { ...options, shell: true })
        : spawnSync(command, args, options)) as ReturnType<typeof spawnSync> & {
        stdout?: string;
        stderr?: string;
    };

const LOCK_STALE_MS = 30 * 60 * 1000;

/**
 * Interprocess mutex via atomic mkdir: two `polli harness` processes must
 * never interpret each other's live transaction journal as a crash. A lock
 * older than LOCK_STALE_MS is considered abandoned (its holder died).
 */
export const withLock = async <T>(
    lockDir: string,
    fn: () => T | Promise<T>,
): Promise<T> => {
    mkdirSync(dirname(lockDir), { recursive: true, mode: 0o700 });
    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            mkdirSync(lockDir);
            break;
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code !== "EEXIST") throw error;
            const stale =
                Date.now() - statSync(lockDir).mtimeMs > LOCK_STALE_MS;
            if (stale && attempt === 0) {
                rmdirSync(lockDir);
                continue;
            }
            throw new Error(
                `Another polli harness operation is in progress (lock: ${lockDir}). If it crashed, remove that directory and retry.`,
            );
        }
    }
    try {
        return await fn();
    } finally {
        rmdirSync(lockDir);
    }
};
