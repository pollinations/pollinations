import { randomBytes } from "node:crypto";
import { mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

const fileMode = async (path: string): Promise<number> => {
    try {
        return (await stat(path)).mode & 0o777;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0o600;
        throw error;
    }
};

export const writeJsonAtomic = async (
    path: string,
    value: Record<string, unknown>,
): Promise<void> => {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const temporaryPath = join(
        dirname(path),
        `.${basename(path)}.${randomBytes(6).toString("hex")}.tmp`,
    );

    try {
        await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
            encoding: "utf-8",
            mode: await fileMode(path),
        });
        await rename(temporaryPath, path);
    } catch (error) {
        await unlink(temporaryPath).catch(() => undefined);
        throw error;
    }
};
