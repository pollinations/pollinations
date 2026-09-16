import { homedir } from "node:os";
import { join } from "node:path";
import { loginWithDeviceFlow } from "../commands/auth.js";
import { readTextIfExists, writeTextAtomic } from "../harnesses/fs.js";
import { ApiError, gen } from "../lib/api.js";
import { resolveApiKey } from "../lib/config.js";
import { printInfo, printSuccess } from "../lib/output.js";

/**
 * Per-client child keys live in the polli config dir so re-running install
 * reuses them instead of minting a new key every time.
 */
const KEYS_FILE = join(homedir(), ".pollinations", "mcp-keys.json");

interface StoredKey {
    id?: string;
    key: string;
}

const loadStoredKeys = (): Record<string, StoredKey> => {
    const raw = readTextIfExists(KEYS_FILE);
    if (!raw) return {};
    try {
        return JSON.parse(raw) as Record<string, StoredKey>;
    } catch {
        return {};
    }
};

const saveStoredKeys = (all: Record<string, StoredKey>) => {
    writeTextAtomic(KEYS_FILE, `${JSON.stringify(all, null, 2)}\n`, 0o600);
};

const keyIsValid = async (key: string) => {
    try {
        const info = await gen<{ valid: boolean }>("/account/key", {
            apiKey: key,
        });
        return info.valid === true;
    } catch (error) {
        if (error instanceof ApiError && error.status === 401) return false;
        throw error;
    }
};

/**
 * Key the client will use for MCP calls: the stored child key for this client
 * if still valid, otherwise a fresh key named after the client, minted from
 * the polli login (logging in first if needed).
 */
export const resolveMcpClientKey = async (
    clientId: string,
    clientLabel: string,
    options: { browser?: boolean } = {},
): Promise<string> => {
    const stored = loadStoredKeys()[clientId];
    if (stored?.key && (await keyIsValid(stored.key))) {
        printInfo(
            `Reusing the Pollinations key already minted for ${clientLabel}.`,
        );
        return stored.key;
    }

    const accountKey =
        resolveApiKey() ??
        (await loginWithDeviceFlow({ browser: options.browser }));
    const name = `polli-mcp-${clientId}`;
    const created = await gen<{ id: string; key: string }>("/account/keys", {
        apiKey: accountKey,
        method: "POST",
        body: { name, type: "secret" },
    });
    const all = loadStoredKeys();
    all[clientId] = { id: created.id, key: created.key };
    saveStoredKeys(all);
    printSuccess(`Created API key "${name}" for ${clientLabel}.`);
    return created.key;
};

/** Delete the stored child key for a client (used by `polli mcp remove`). */
export const deleteMcpClientKey = async (clientId: string): Promise<void> => {
    const all = loadStoredKeys();
    const stored = all[clientId];
    if (!stored) return;
    if (stored.id) {
        try {
            await gen(`/account/keys/${stored.id}`, {
                method: "DELETE",
                apiKey: resolveApiKey(),
            });
        } catch {
            // The key may already be gone; never block uninstall on this.
        }
    }
    delete all[clientId];
    saveStoredKeys(all);
};

/** The key minted for a client, if any (used for paste-back hints). */
export const getMcpClientKey = (clientId: string): string | null =>
    loadStoredKeys()[clientId]?.key ?? null;
