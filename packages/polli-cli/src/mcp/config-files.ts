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

/** Always owner-only (0600): these files can carry a bearer key in plain text. */
export const writeJsonObject = (path: string, value: JsonObject) =>
    writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`, 0o600);

const entryArgs = (entry: JsonObject): unknown[] => {
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
 * Pollinations owns an MCP entry when it points at the gen gateway's /mcp/
 * endpoints — either directly (url / serverUrl / httpUrl) or through the
 * mcp-remote bridge, which carries the URL as a bare argument (Zed).
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
    return entryArgs(entry).some(
        (arg) => typeof arg === "string" && arg.startsWith(prefix),
    );
};

/** Names of Pollinations-owned entries inside an mcpServers-style table. */
export const ownedEntryNames = (
    table: unknown,
    baseUrl: string = BASE_URL,
): string[] => {
    if (!table || typeof table !== "object") return [];
    return Object.entries(table as JsonObject)
        .filter(([, value]) => isOwnedEntry(value, baseUrl))
        .map(([name]) => name);
};

const BEARER_HEADER = /^Bearer\s+(\S+)$/;
const BEARER_ARG = /^Authorization:\s*Bearer\s+(\S+)$/;

/**
 * Recover the literal Pollinations key already written into an owned entry,
 * so a re-install can reuse it instead of minting a new one. Returns null for
 * entries that never carry the literal value — VS Code writes a
 * `${input:...}` placeholder instead of the key, which this deliberately
 * does not treat as reusable.
 */
export const ownedEntryKey = (value: unknown): string | null => {
    if (!value || typeof value !== "object") return null;
    const entry = value as JsonObject;
    const headers = entry.headers;
    if (headers && typeof headers === "object") {
        const auth = (headers as JsonObject).Authorization;
        if (typeof auth === "string") {
            const match = BEARER_HEADER.exec(auth);
            if (match && !match[1].includes("${")) return match[1];
        }
    }
    const args = entryArgs(entry);
    for (let i = 0; i < args.length; i++) {
        if (args[i] !== "--header") continue;
        const match =
            typeof args[i + 1] === "string"
                ? BEARER_ARG.exec(args[i + 1] as string)
                : null;
        if (match) return match[1];
    }
    return null;
};

/** First recoverable key among an mcpServers-style table's owned entries. */
export const firstOwnedKey = (
    table: unknown,
    baseUrl: string = BASE_URL,
): string | null => {
    if (!table || typeof table !== "object") return null;
    for (const value of Object.values(table as JsonObject)) {
        if (!isOwnedEntry(value, baseUrl)) continue;
        const key = ownedEntryKey(value);
        if (key) return key;
    }
    return null;
};

/** Upsert KEY=value lines in an env file (e.g. ~/.codex/.env). */
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

/** Read one KEY's value out of an env file, if present. */
export const readEnvValue = (path: string, name: string): string | null => {
    const text = readTextIfExists(path);
    if (!text) return null;
    const pattern = new RegExp(`^${name}\\s*=\\s*(.*)$`);
    for (const line of text.split("\n")) {
        const match = pattern.exec(line.trim());
        if (match) return match[1];
    }
    return null;
};
