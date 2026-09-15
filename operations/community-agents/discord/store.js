import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export class TokenStore {
    constructor(path) {
        this.path = path;
        this.writeQueue = Promise.resolve();
    }

    async readAll() {
        try {
            const parsed = JSON.parse(await readFile(this.path, "utf8"));
            return parsed && typeof parsed === "object" ? parsed : {};
        } catch (error) {
            if (error?.code === "ENOENT") return {};
            throw error;
        }
    }

    async get(discordUserId) {
        return (await this.readAll())[discordUserId] ?? null;
    }

    async set(discordUserId, value) {
        return this.mutate((all) => {
            all[discordUserId] = value;
        });
    }

    async delete(discordUserId) {
        return this.mutate((all) => {
            if (!(discordUserId in all)) return false;
            delete all[discordUserId];
            return true;
        });
    }

    async mutate(change) {
        const operation = this.writeQueue.then(async () => {
            const all = await this.readAll();
            const result = change(all);
            if (result !== false) await this.writeAll(all);
            return result;
        });
        this.writeQueue = operation.catch(() => {});
        return operation;
    }

    async writeAll(all) {
        await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
        const temporaryPath = `${this.path}.${process.pid}.tmp`;
        await writeFile(temporaryPath, `${JSON.stringify(all, null, 2)}\n`, {
            mode: 0o600,
        });
        await chmod(temporaryPath, 0o600);
        await rename(temporaryPath, this.path);
        await chmod(this.path, 0o600);
    }
}
