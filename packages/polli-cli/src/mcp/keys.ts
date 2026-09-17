import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { writeTextAtomic } from "../harnesses/fs.js";

const KEYS_DIR = join(homedir(), ".pollinations");
const KEYS_FILE = join(KEYS_DIR, "mcp-keys.json");

interface KeyStore {
    [clientId: string]: string;
}

const loadKeys = (): KeyStore => {
    if (!existsSync(KEYS_FILE)) return {};
    try {
        return JSON.parse(readFileSync(KEYS_FILE, "utf-8")) as KeyStore;
    } catch {
        return {};
    }
};

const saveKeys = (store: KeyStore) => {
    if (!existsSync(KEYS_DIR)) {
        mkdirSync(KEYS_DIR, { recursive: true, mode: 0o700 });
    }
    writeTextAtomic(KEYS_FILE, `${JSON.stringify(store, null, 2)}\n`, 0o600);
};

export const keysFilePath = (): string => KEYS_FILE;

export const getStoredKey = (clientId: string): string | null =>
    loadKeys()[clientId] ?? null;

export const storeKey = (clientId: string, key: string) => {
    const store = loadKeys();
    store[clientId] = key;
    saveKeys(store);
};

export const removeStoredKey = (clientId: string) => {
    const store = loadKeys();
    delete store[clientId];
    saveKeys(store);
};
