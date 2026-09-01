/**
 * Minimal per-user token store backed by a single JSON file.
 * Maps Discord user IDs to their scoped Pollinations key (`sk_...`).
 *
 * Hardening properties:
 * - Writes are atomic (temp file + rename): a crash mid-write can never
 *   leave a half-written, corrupt store behind.
 * - The file is written with owner-only permissions (0600) and is
 *   gitignored — it must never be committed or logged.
 * - Optional AES-256-GCM encryption at rest: set TOKEN_STORE_SECRET and
 *   the on-disk file holds only iv/tag/ciphertext. Off by default, because
 *   for a self-hosted example bot a plaintext 0600 file next to the
 *   process env is an honest, understandable threat model — but the option
 *   is there for shared hosts.
 */

import {
    createCipheriv,
    createDecipheriv,
    randomBytes,
    scryptSync,
} from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const ENC_SALT = "pollinations-discord-community-agent-store-v1";

export class TokenStore {
    #path;
    #secret;

    constructor(path, { secret = process.env.TOKEN_STORE_SECRET } = {}) {
        this.#path = path;
        this.#secret = secret || null;
    }

    #key() {
        return scryptSync(this.#secret, ENC_SALT, 32);
    }

    #read() {
        let parsed;
        try {
            parsed = JSON.parse(readFileSync(this.#path, "utf8"));
        } catch {
            return {};
        }
        if (!parsed?.encrypted) return parsed ?? {};
        if (!this.#secret) {
            throw new Error(
                "Token store is encrypted; set TOKEN_STORE_SECRET to read it.",
            );
        }
        const decipher = createDecipheriv(
            "aes-256-gcm",
            this.#key(),
            Buffer.from(parsed.iv, "base64"),
        );
        decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
        const plain = Buffer.concat([
            decipher.update(Buffer.from(parsed.data, "base64")),
            decipher.final(),
        ]);
        return JSON.parse(plain.toString("utf8"));
    }

    #write(map) {
        mkdirSync(dirname(this.#path), { recursive: true });
        let payload;
        if (this.#secret) {
            const iv = randomBytes(12);
            const cipher = createCipheriv("aes-256-gcm", this.#key(), iv);
            const data = Buffer.concat([
                cipher.update(JSON.stringify(map), "utf8"),
                cipher.final(),
            ]);
            payload = JSON.stringify({
                encrypted: true,
                iv: iv.toString("base64"),
                tag: cipher.getAuthTag().toString("base64"),
                data: data.toString("base64"),
            });
        } else {
            payload = JSON.stringify(map);
        }
        // Atomic write: temp file + rename within the same directory.
        const tmp = `${this.#path}.${process.pid}.tmp`;
        writeFileSync(tmp, payload, { mode: 0o600 });
        renameSync(tmp, this.#path);
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
