import {
    existsSync,
    mkdirSync,
    readFileSync,
    unlinkSync,
    writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".pollinations");
const CREDENTIALS_FILE = join(CONFIG_DIR, "credentials.json");


export interface PolliCredentials {
    apiKey?: string;
    keyType?: "pk" | "sk";
}

const ensureDir = () => {
    if (!existsSync(CONFIG_DIR)) {
        mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    }
};

const readJson = <T>(path: string): T | null => {
    if (!existsSync(path)) return null;
    try {
        return JSON.parse(readFileSync(path, "utf-8")) as T;
    } catch {
        return null;
    }
};

export const loadCredentials = (): PolliCredentials =>
    readJson(CREDENTIALS_FILE) ?? {};

export const saveCredentials = (creds: PolliCredentials) => {
    ensureDir();
    writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2), {
        encoding: "utf-8",
        mode: 0o600,
    });
};

export const clearCredentials = () => {
    try {
        unlinkSync(CREDENTIALS_FILE);
    } catch {
        // file didn't exist
    }
};

/** Module-level override set by --key flag (avoids leaking to process.env) */
let _keyOverride: string | undefined;

export const setKeyOverride = (key: string) => {
    _keyOverride = key;
};

/** Resolve the API key — flag override > env > stored credentials */
export const resolveApiKey = (flagKey?: string): string | undefined =>
    flagKey ??
    _keyOverride ??
    process.env.POLLINATIONS_API_KEY ??
    process.env.POLLI_KEY ??
    loadCredentials().apiKey;

export const BASE_URL =
    process.env.POLLINATIONS_BASE_URL ?? "https://gen.pollinations.ai";

export const ENTER_URL =
    process.env.POLLINATIONS_ENTER_URL ?? "https://enter.pollinations.ai";

/** Return the user's --model flag value, or undefined to let the server pick. */
export const resolveModel = (flagValue?: string): string | undefined =>
    flagValue;
