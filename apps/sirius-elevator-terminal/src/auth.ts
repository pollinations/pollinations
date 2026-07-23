// BYOP device login — OAuth 2.0 Device Authorization Grant (RFC 8628) against
// enter.pollinations.ai. No browser redirect / local server needed: we show the
// user a short code, they approve it in their browser, and we poll for the key.
//
// Endpoints (enter.pollinations.ai/src/routes/device.ts):
//   POST /api/device/code   -> { device_code, user_code, verification_uri,
//                                verification_uri_complete, expires_in, interval }
//   POST /api/device/token  -> { access_token } | { error: authorization_pending
//                                | slow_down | access_denied | expired_token }
// The minted sk_ key works against gen.pollinations.ai/v1/chat/completions.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const ENTER_API = "https://enter.pollinations.ai/api";
const CONFIG_DIR = join(homedir(), ".config", "sirius-elevator");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export type DeviceCode = {
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete: string;
    expires_in: number;
    interval: number;
};

export type Profile = {
    githubUsername: string | null;
    tier: string | null;
};

type StoredConfig = { apiKey?: string; model?: string };

// --- Persistent config ------------------------------------------------------

async function readConfig(): Promise<StoredConfig> {
    try {
        return JSON.parse(await readFile(CONFIG_FILE, "utf8"));
    } catch {
        return {};
    }
}

async function writeConfig(patch: StoredConfig): Promise<void> {
    const current = await readConfig();
    await mkdir(CONFIG_DIR, { recursive: true });
    await writeFile(
        CONFIG_FILE,
        JSON.stringify({ ...current, ...patch }, null, 2),
    );
}

export async function getStoredApiKey(): Promise<string | null> {
    return (
        process.env.POLLINATIONS_API_KEY ?? (await readConfig()).apiKey ?? null
    );
}

export async function storeApiKey(apiKey: string): Promise<void> {
    await writeConfig({ apiKey });
}

export async function clearApiKey(): Promise<void> {
    await writeConfig({ apiKey: undefined });
}

export async function getStoredModel(): Promise<string | null> {
    return (await readConfig()).model ?? null;
}

export async function storeModel(model: string): Promise<void> {
    await writeConfig({ model });
}

// --- Device flow ------------------------------------------------------------

// Step 1: request a device + user code. `profile usage` lets the resulting key
// read the player's profile and balance (it can generate text regardless).
export async function requestDeviceCode(): Promise<DeviceCode> {
    const res = await fetch(`${ENTER_API}/device/code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            client_id: "sirius-elevator-terminal",
            scope: "profile usage",
        }),
    });
    if (!res.ok) {
        throw new Error(`Could not start device login (HTTP ${res.status})`);
    }
    return (await res.json()) as DeviceCode;
}

export type PollResult =
    | { status: "approved"; apiKey: string }
    | { status: "pending" }
    | { status: "denied" }
    | { status: "expired" };

// Step 2 (called on a loop): exchange the device code for the API key.
export async function pollForToken(deviceCode: string): Promise<PollResult> {
    const res = await fetch(`${ENTER_API}/device/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_code: deviceCode }),
    });
    const data = (await res.json().catch(() => ({}))) as {
        access_token?: string;
        error?: string;
    };

    if (res.ok && data.access_token) {
        return { status: "approved", apiKey: data.access_token };
    }
    if (data.error === "access_denied") return { status: "denied" };
    if (data.error === "expired_token") return { status: "expired" };
    return { status: "pending" }; // authorization_pending / slow_down / transient
}

// --- Account info -----------------------------------------------------------

export async function fetchProfile(apiKey: string): Promise<Profile | null> {
    try {
        const res = await fetch(`${ENTER_API}/account/profile`, {
            headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!res.ok) return null;
        const data = (await res.json()) as {
            githubUsername?: string | null;
            tier?: string | null;
        };
        return {
            githubUsername: data.githubUsername ?? null,
            tier: data.tier ?? null,
        };
    } catch {
        return null;
    }
}

export async function fetchBalance(apiKey: string): Promise<number | null> {
    try {
        const res = await fetch(`${ENTER_API}/account/balance`, {
            headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { balance?: number };
        return typeof data.balance === "number" ? data.balance : null;
    } catch {
        return null;
    }
}
