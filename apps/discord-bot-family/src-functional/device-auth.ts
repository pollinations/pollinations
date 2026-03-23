import axios from "axios";
import debug from "debug";
import { existsSync, readFileSync, writeFileSync } from "fs";

const log = debug("app:device-auth");

const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_DURATION_MS = 30 * 60_000; // 30 minutes

interface StoredToken {
    token: string;
    expiresAt?: string;
}

type TokenStore = Record<string, StoredToken>;

const TOKEN_FILE = "/tmp/discord-bot-user-tokens.json";

function loadTokens(): TokenStore {
    try {
        if (existsSync(TOKEN_FILE)) {
            return JSON.parse(readFileSync(TOKEN_FILE, "utf-8"));
        }
    } catch (e) {
        log("Failed to load tokens: %O", e);
    }
    return {};
}

function saveTokens(tokens: TokenStore): void {
    writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
}

/**
 * Get stored API token for a Discord user, or null if none/expired.
 */
export function getUserToken(discordUserId: string): string | null {
    const tokens = loadTokens();
    const entry = tokens[discordUserId];
    if (!entry) return null;
    if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) {
        log("Token expired for user %s", discordUserId);
        delete tokens[discordUserId];
        saveTokens(tokens);
        return null;
    }
    return entry.token;
}

/**
 * Store an API token for a Discord user.
 */
export function storeUserToken(discordUserId: string, token: string, expiresIn?: number): void {
    const tokens = loadTokens();
    tokens[discordUserId] = {
        token,
        expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : undefined,
    };
    saveTokens(tokens);
    log("Stored token for user %s", discordUserId);
}

interface DeviceCodeResponse {
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete: string;
    expires_in: number;
    interval: number;
}

/**
 * Request a device code from the Pollinations device auth endpoint.
 */
export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
    const res = await axios.post("https://enter.pollinations.ai/api/device/code", {
        scope: "generate",
    });
    log("Device code response: %O", res.data);
    return res.data;
}

/**
 * Poll for token until approved, denied, or expired.
 * Returns the access_token on success, throws on denial/expiry.
 */
export async function pollForToken(deviceCode: string): Promise<{ accessToken: string; expiresIn?: number }> {
    const start = Date.now();

    while (Date.now() - start < MAX_POLL_DURATION_MS) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

        try {
            const res = await axios.post("https://enter.pollinations.ai/api/device/token", {
                device_code: deviceCode,
            });
            // Success
            return {
                accessToken: res.data.access_token,
                expiresIn: res.data.expires_in,
            };
        } catch (err: any) {
            const error = err.response?.data?.error;
            if (error === "authorization_pending") {
                continue;
            }
            if (error === "access_denied") {
                throw new Error("User denied the authorization request");
            }
            if (error === "expired_token") {
                throw new Error("Device code expired");
            }
            // Unknown error
            log("Unexpected poll error: %O", err.response?.data || err.message);
            throw new Error(`Device auth failed: ${error || err.message}`);
        }
    }

    throw new Error("Device code polling timed out");
}
