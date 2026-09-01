/**
 * Minimal per-user token store backed by a single JSON file.
 * Maps Discord user IDs to their scoped Pollinations key (`sk_...`).
 * The file is written with owner-only permissions and is gitignored —
 * it must never be committed or logged.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export class TokenStore {
    #path;

    constructor(path) {
        this.#path = path;
    }

    #read() {
        try {
            return JSON.parse(readFileSync(this.#path, "utf8"));
        } catch {
            return {};
        }
    }

    #write(map) {
        mkdirSync(dirname(this.#path), { recursive: true });
        writeFileSync(this.#path, JSON.stringify(map), { mode: 0o600 });
    }

    get(userId) {
        return this.#read()[userId] ?? null;
    }

    set(userId, token) {
        const map = this.#read();
        map[userId] = token;
        this.#write(map);
    }

    delete(userId) {
        const map = this.#read();
        delete map[userId];
        this.#write(map);
    }
}
