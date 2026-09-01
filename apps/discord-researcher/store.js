import { chmod, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";

const EMPTY_STORE = { version: 1, tokens: {} };

function validUserId(value) {
    return typeof value === "string" && /^\d{1,25}$/.test(value);
}

function validToken(value) {
    return typeof value === "string" && /^sk_[A-Za-z0-9._~-]+$/.test(value);
}

function parseStore(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Token store has an invalid shape");
    }
    const record = value;
    if (
        record.version !== 1 ||
        !record.tokens ||
        typeof record.tokens !== "object" ||
        Array.isArray(record.tokens)
    ) {
        throw new Error("Token store has an invalid shape");
    }
    const tokens = {};
    for (const [userId, entry] of Object.entries(record.tokens)) {
        if (
            !validUserId(userId) ||
            !entry ||
            typeof entry !== "object" ||
            Array.isArray(entry) ||
            !validToken(entry.accessToken)
        ) {
            throw new Error("Token store has an invalid shape");
        }
        tokens[userId] = { accessToken: entry.accessToken };
    }
    return { version: 1, tokens };
}

export class TokenStore {
    #path;
    #write = Promise.resolve();

    constructor(path) {
        if (!path) throw new Error("Token store path is required");
        this.#path = path;
    }

    async read() {
        try {
            return parseStore(JSON.parse(await readFile(this.#path, "utf8")));
        } catch (error) {
            if (error?.code === "ENOENT") return structuredClone(EMPTY_STORE);
            throw error;
        }
    }

    async get(userId) {
        if (!validUserId(userId)) throw new Error("Invalid Discord user ID");
        return (await this.read()).tokens[userId]?.accessToken ?? null;
    }

    async set(userId, accessToken) {
        if (!validUserId(userId) || !validToken(accessToken))
            throw new Error("Invalid token record");
        return this.#update((store) => {
            store.tokens[userId] = { accessToken };
        });
    }

    async delete(userId) {
        if (!validUserId(userId)) throw new Error("Invalid Discord user ID");
        return this.#update((store) => {
            delete store.tokens[userId];
        });
    }

    async #update(change) {
        const operation = this.#write.then(async () => {
            const store = await this.read();
            change(store);
            const directory = dirname(this.#path);
            await mkdir(directory, { recursive: true });
            const temporary = `${this.#path}.${process.pid}.${crypto.randomUUID()}.tmp`;
            const handle = await open(temporary, "wx", 0o600);
            try {
                await handle.writeFile(`${JSON.stringify(store)}\n`, "utf8");
                await handle.chmod(0o600);
            } finally {
                await handle.close();
            }
            try {
                await rename(temporary, this.#path);
                await chmod(this.#path, 0o600);
            } finally {
                await unlink(temporary).catch(() => {});
            }
        });
        this.#write = operation.catch(() => {});
        return operation;
    }
}

export { parseStore, validToken, validUserId };
