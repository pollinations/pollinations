import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export class TokenStore {
    constructor(path = process.env.TOKEN_STORE_PATH || "./data/tokens.json") {
        this.path = path;
        this.writeQueue = Promise.resolve();
    }

    async readAll() {
        try {
            const raw = await readFile(this.path, "utf8");
            const parsed = JSON.parse(raw);
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
            return true;
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
        const tmp = `${this.path}.${process.pid}.tmp`;
        await writeFile(tmp, `${JSON.stringify(all, null, 2)}\n`, {
            mode: 0o600,
        });
        await chmod(tmp, 0o600);
        await rename(tmp, this.path);
        await chmod(this.path, 0o600);
    }
}
