import { readTextIfExists, writeTextAtomic } from "../harnesses/fs.js";
import { BASE_URL } from "../lib/config.js";

export type JsonObject = Record<string, unknown>;

/** Read a JSON config file; a missing or empty file means an empty object. */
export const readJsonObject = (path: string): JsonObject => {
    const text = readTextIfExists(path);
    if (!text?.trim()) return {};
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(`${path} does not contain a JSON object`);
    }
    return parsed as JsonObject;
};

export const writeJsonObject = (path: string, value: JsonObject) =>
    writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`, 0o600);

const asArgs = (entry: JsonObject): unknown[] => {
    if (Array.isArray(entry.args)) return entry.args;
    const command = entry.command;
    if (
        command &&
        typeof command === "object" &&
        Array.isArray((command as JsonObject).args)
    ) {
        return (command as JsonObject).args as unknown[];
    }
    return [];
};

/**
 * Pollinations owns an MCP entry when it points at the gen gateway's `/mcp/`
 * endpoints — directly via a URL field (`url` / `serverUrl` / `httpUrl`) or
 * through an `mcp-remote` bridge that carries the URL in its args (Zed).
 * Entries pointing anywhere else are never touched by install/remove.
 */
export const isOwnedEntry = (
    value: unknown,
    baseUrl: string = BASE_URL,
): boolean => {
    if (!value || typeof value !== "object") return false;
    const entry = value as JsonObject;
    const prefix = `${baseUrl}/mcp/`;
    for (const field of ["url", "serverUrl", "httpUrl"]) {
        const url = entry[field];
        if (typeof url === "string" && url.startsWith(prefix)) return true;
    }
    return asArgs(entry).some(
        (arg) => typeof arg === "string" && arg.startsWith(prefix),
    );
};

/** Names of Pollinations-owned entries inside an `mcpServers`-style table. */
export const ownedEntryNames = (
    table: unknown,
    baseUrl: string = BASE_URL,
): string[] => {
    if (!table || typeof table !== "object") return [];
    return Object.entries(table as JsonObject)
        .filter(([, value]) => isOwnedEntry(value, baseUrl))
        .map(([name]) => name);
};

/** Upsert `KEY=value` lines in an env file (e.g. `~/.codex/.env`). */
export const upsertEnvFile = (path: string, values: Record<string, string>) => {
    const lines = (readTextIfExists(path) ?? "").split("\n");
    const kept = lines.filter(
        (line) =>
            line.trim() !== "" &&
            !Object.keys(values).some((name) =>
                new RegExp(`^${name}\\s*=`).test(line),
            ),
    );
    for (const [name, value] of Object.entries(values)) {
        kept.push(`${name}=${value}`);
    }
    writeTextAtomic(path, `${kept.join("\n")}\n`, 0o600);
};

/** Extract the key from a `Bearer <key>` value (header value or CLI arg). */
const keyFromBearer = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const match =
        /^Authorization[:=]\s*Bearer\s+(\S+)$/.exec(value.trim()) ??
        /^Bearer\s+(\S+)$/.exec(value.trim());
    const key = match?.[1];
    // VS Code stores a `${input:...}` reference, not a literal key.
    if (!key || key.includes("${")) return null;
    return key;
};

/**
 * Find the key a previous install wrote into a client config: checks the
 * headers of Pollinations-owned entries and, for bridge-style entries (Zed),
 * their args. Only owned entries are read — a foreign key is never reused.
 */
export const recoverKeyFromTable = (
    table: unknown,
    baseUrl: string = BASE_URL,
): string | null => {
    if (!table || typeof table !== "object") return null;
    for (const value of Object.values(table as JsonObject)) {
        if (!isOwnedEntry(value, baseUrl)) continue;
        const entry = value as JsonObject;
        const headers = entry.headers;
        if (headers && typeof headers === "object") {
            for (const headerValue of Object.values(headers as JsonObject)) {
                const key = keyFromBearer(headerValue);
                if (key) return key;
            }
        }
        for (const arg of asArgs(entry)) {
            const key = keyFromBearer(arg);
            if (key) return key;
        }
    }
    return null;
};
