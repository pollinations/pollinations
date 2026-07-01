import {
    existsSync,
    mkdirSync,
    readFileSync,
    unlinkSync,
    writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getSecureCredential, setSecureCredential, deleteSecureCredential } from "./secure-storage.js";

const CONFIG_DIR = join(homedir(), ".pollinations");
const CREDENTIALS_FILE = join(CONFIG_DIR, "credentials.json");

export interface PolliCredentials {
    apiKey?: string;
    keyType?: "pk" | "sk";
}

export const loadCredentials = async (): Promise<PolliCredentials> => {
    // Try secure storage first
    try {
        const stored = await getSecureCredential("api-key");
        if (stored) {
            return { apiKey: stored };
        }
    } catch {
        // fall back to file
    }
    if (!existsSync(CREDENTIALS_FILE)) return {};
    try {
        return JSON.parse(
            readFileSync(CREDENTIALS_FILE, "utf-8"),
        ) as PolliCredentials;
    } catch {
        return {};
    }
};

// Synchronous version for backward compatibility
export const loadCredentialsSync = (): PolliCredentials => {
    if (!existsSync(CREDENTIALS_FILE)) return {};
    try {
        return JSON.parse(
            readFileSync(CREDENTIALS_FILE, "utf-8"),
        ) as PolliCredentials;
    } catch {
        return {};
    }
};

export const saveCredentials = async (creds: PolliCredentials): Promise<void> => {
    // Store in secure storage if available
    if (creds.apiKey) {
        try {
            await setSecureCredential("api-key", creds.apiKey);
            // Also keep file for backward compatibility
        } catch {
            // fall back to file
        }
    }
    if (!existsSync(CONFIG_DIR)) {
        mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    }
    writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2), {
        encoding: "utf-8",
        mode: 0o600,
    });
};

export const clearCredentials = async (): Promise<void> => {
    try {
        await deleteSecureCredential("api-key");
    } catch {
        // ignore
    }
    try {
        unlinkSync(CREDENTIALS_FILE);
    } catch {
        // ignore
    }
};

let _keyOverride: string | undefined;
let _cachedCredentials: PolliCredentials | null = null;

export const setKeyOverride = (key: string) => {
    _keyOverride = key;
    _cachedCredentials = null;
};

export const resolveApiKey = async (flagKey?: string): Promise<string | undefined> => {
    if (flagKey) return flagKey;
    if (_keyOverride) return _keyOverride;
    if (_cachedCredentials?.apiKey) return _cachedCredentials.apiKey;
    const creds = await loadCredentials();
    _cachedCredentials = creds;
    return creds.apiKey;
};

// Synchronous version for commands that need to block
export const resolveApiKeySync = (flagKey?: string): string | undefined => {
    if (flagKey) return flagKey;
    if (_keyOverride) return _keyOverride;
    const creds = loadCredentialsSync();
    return creds.apiKey;
};

export const BASE_URL =
    process.env.POLLINATIONS_BASE_URL ?? "https://gen.pollinations.ai";
export const ENTER_URL =
    process.env.POLLINATIONS_ENTER_URL ?? "https://enter.pollinations.ai";
export const MEDIA_URL =
    process.env.POLLINATIONS_MEDIA_URL ?? "https://media.pollinations.ai";