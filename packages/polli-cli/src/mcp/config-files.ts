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
    writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`);

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
 * Pollinations owns an MCP entry when it points at the gen gateway's /mcp/
 * endpoints — either directly via a URL field (url / serverUrl / httpUrl) or
 * through an mcp-remote bridge that carries the URL in its args (Zed).
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
    writeTextAtomic(path, `${kept.join("\n")}\n`);
};
