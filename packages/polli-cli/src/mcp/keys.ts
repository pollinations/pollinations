import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveHarnessKey } from "../harnesses/keys.js";

/**
 * Where we remember the dedicated key minted for each MCP client, so
 * reinstalling reuses it instead of minting a duplicate on every run.
 */
const keyStorePath = () =>
    path.join(os.homedir(), ".pollinations", "mcp-keys.json");

const loadKeyStore = (): Record<string, string> => {
    try {
        return JSON.parse(fs.readFileSync(keyStorePath(), "utf8")) as Record<
            string,
            string
        >;
    } catch {
        return {};
    }
};

const saveKeyStore = (store: Record<string, string>) => {
    fs.mkdirSync(path.dirname(keyStorePath()), { recursive: true });
    fs.writeFileSync(keyStorePath(), JSON.stringify(store, null, 2), "utf8");
};

/**
 * The Pollinations key a client will authenticate MCP calls with: a dedicated
 * secret named `polli-harness-mcp-<client>`, minted once and reused across
 * reinstalls (revalidated against the API when it already exists).
 */
export const ensureMcpKey = async (
    client: string,
    label: string,
): Promise<string> => {
    const store = loadKeyStore();
    const key = await resolveHarnessKey({
        id: `mcp-${client}`,
        label,
        existingKey: store[client] ?? null,
    });
    if (store[client] !== key) {
        store[client] = key;
        saveKeyStore(store);
    }
    return key;
};

export const storedMcpKey = (client: string): string | null =>
    loadKeyStore()[client] ?? null;
