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

export const loadCredentials = (): PolliCredentials => {
    if (!existsSync(CREDENTIALS_FILE)) return {};
    try {
        return JSON.parse(
            readFileSync(CREDENTIALS_FILE, "utf-8"),
        ) as PolliCredentials;
    } catch {
        return {};
    }
};

export const saveCredentials = (creds: PolliCredentials) => {
    if (!existsSync(CONFIG_DIR)) {
        mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    }
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

let _keyOverride: string | undefined;

export const setKeyOverride = (key: string | undefined) => {
    _keyOverride = key;
};

export const resolveApiKey = (flagKey?: string): string | undefined =>
    flagKey ?? _keyOverride ?? loadCredentials().apiKey;

export const BASE_URL =
    process.env.POLLINATIONS_BASE_URL ?? "https://gen.pollinations.ai";

/**
 * Security boundary for MCP entry ownership (which config entries are ours).
 * Deliberately NOT env-overridable: `POLLINATIONS_BASE_URL` may point at
 * mirrors/test doubles, and an environment-controlled boundary would let a
 * hostile env var claim foreign entries as ours — then `off` would strip
 * them. API calls keep using `BASE_URL`; ownership never moves.
 */
export const OWNERSHIP_URL = "https://gen.pollinations.ai";

export const ENTER_URL =
    process.env.POLLINATIONS_ENTER_URL ?? "https://enter.pollinations.ai";

export const MEDIA_URL =
    process.env.POLLINATIONS_MEDIA_URL ?? "https://media.pollinations.ai";
