import { spawnSync } from "node:child_process";
import JSON5 from "json5";
import {
    readTextIfExists,
    removeIfExists,
    writeTextAtomic,
} from "../harnesses/fs.js";
import { BASE_URL } from "../lib/config.js";

export type JsonObject = Record<string, unknown>;

/** Every Pollinations MCP endpoint lives under this prefix. */
export const mcpUrlPrefix = `${BASE_URL}/mcp/`;

/**
 * Whether a config entry connects to a Pollinations MCP server. Ownership is
 * decided by the URL (or by a URL passed to a bridge command), never by the
 * entry name, so user-renamed entries are still recognised.
 */
export const isOwnedEntry = (entry: unknown): boolean => {
    if (!entry || typeof entry !== "object") return false;
    const record = entry as JsonObject;
    for (const field of ["url", "serverUrl", "httpUrl"]) {
        const value = record[field];
        if (typeof value === "string" && value.startsWith(mcpUrlPrefix)) {
            return true;
        }
    }
    const args = record.args;
    return (
        Array.isArray(args) &&
        args.some(
            (arg) => typeof arg === "string" && arg.includes(mcpUrlPrefix),
        )
    );
};

/** Names of the Pollinations entries inside a `mcpServers`-style table. */
export const ownedEntryNames = (container: unknown): string[] => {
    if (!container || typeof container !== "object") return [];
    return Object.entries(container as JsonObject)
        .filter(([, entry]) => isOwnedEntry(entry))
        .map(([name]) => name);
};

/** Bearer token an entry sends, if it is written in the entry itself. */
export const bearerFromEntry = (entry: unknown): string | null => {
    if (!entry || typeof entry !== "object") return null;
    const record = entry as JsonObject;
    for (const field of ["headers", "http_headers"]) {
        const headers = record[field];
        if (!headers || typeof headers !== "object") continue;
        for (const [name, value] of Object.entries(headers as JsonObject)) {
            if (name.toLowerCase() !== "authorization") continue;
            if (typeof value !== "string") continue;
            const match = /^Bearer\s+(\S+)$/i.exec(value.trim());
            if (match) return match[1];
        }
    }
    return null;
};

/** Keep secrets out of error messages, which may echo the command we ran. */
export const redact = (text: string, secrets: string[] = []) =>
    secrets
        .filter((secret) => secret.length > 0)
        .reduce((acc, secret) => acc.split(secret).join("<redacted>"), text);

/** Run a client's own CLI, failing with its output when it errors. */
export const runCli = (
    command: string,
    args: string[],
    options: { env: NodeJS.ProcessEnv; secrets?: string[] },
) => {
    const { env, secrets = [] } = options;
    const result = spawnSync(command, args, { env, encoding: "utf-8" });
    if (result.error) {
        throw new Error(
            redact(
                `${command} could not be run: ${result.error.message}`,
                secrets,
            ),
        );
    }
    if (result.status !== 0) {
        const detail = redact(
            (result.stderr || result.stdout || "").trim(),
            secrets,
        );
        throw new Error(
            `${redact(`${command} exited with code ${result.status}`, secrets)}${detail ? `: ${detail}` : ""}`,
        );
    }
    return result.stdout ?? "";
};

export interface JsonFile {
    path: string;
    data: JsonObject;
    /** true when the file uses JSON5/JSONC syntax (comments, trailing commas). */
    jsonc: boolean;
}

const isStrictJson = (text: string) => {
    try {
        JSON.parse(text);
        return true;
    } catch {
        return false;
    }
};

/** Read a JSON/JSONC object file; an empty or missing file reads as `{}`. */
export const readJsonFile = (path: string): JsonFile => {
    const text = readTextIfExists(path);
    if (text === null || !text.trim()) return { path, data: {}, jsonc: false };
    const jsonc = !isStrictJson(text);
    try {
        const parsed: unknown = jsonc ? JSON5.parse(text) : JSON.parse(text);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error("expected a JSON object");
        }
        return { path, data: parsed as JsonObject, jsonc };
    } catch (error) {
        throw new Error(
            `${path} could not be parsed (${
                error instanceof Error ? error.message : "invalid JSON"
            }); it was left untouched`,
        );
    }
};

/**
 * A config that carries the key in an `Authorization: Bearer ...` header holds a
 * secret. `writeTextAtomic` preserves the mode of a file that already exists, so
 * a config created before polli touched it would keep its 0644 and every local
 * user could read the key; such a file is rewritten owner-only. Configs without
 * a literal token (an input reference, or a file polli only removes entries
 * from) keep whatever mode they had.
 */
const carriesBearer = (text: string) =>
    /"authorization"\s*:\s*"Bearer\s+(?!\$\{)[^"]+"/i.test(text);

export const writeJsonFile = (path: string, data: JsonObject) => {
    const text = `${JSON.stringify(data, null, 4)}\n`;
    return writeTextAtomic(path, text, carriesBearer(text) ? 0o600 : undefined);
};

export const readTable = (data: JsonObject, name: string): JsonObject => {
    const value = data[name];
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as JsonObject)
        : {};
};

/** Read a nested table such as Amp's `amp.mcpServers`. */
export const readNestedTable = (data: JsonObject, path: string[]): JsonObject =>
    path.reduce<JsonObject>(
        (current, key) =>
            current && typeof current === "object"
                ? readTable(current, key)
                : {},
        data,
    );

export const writeTable = (
    data: JsonObject,
    name: string,
    value: JsonObject,
) => {
    if (Object.keys(value).length === 0) delete data[name];
    else data[name] = value;
};

export const readEnvValue = (path: string, name: string): string | null => {
    const text = readTextIfExists(path);
    if (!text) return null;
    for (const line of text.split(/\r?\n/)) {
        const match =
            /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
        if (match?.[1] === name) {
            return match[2].trim().replace(/^["']|["']$/g, "");
        }
    }
    return null;
};

const envLinePattern = (name: string) =>
    new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=`);

/** Set one variable in an env file, leaving every other line alone. */
export const writeEnvValue = (path: string, name: string, value: string) => {
    const text = readTextIfExists(path) ?? "";
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    const last = lines.length - 1;
    const body = lines.filter(
        (line, index) => !(index === last && line === ""),
    );
    const entry = `${name}=${value}`;
    const at = body.findIndex((line) => envLinePattern(name).test(line));
    if (at >= 0) {
        if (body[at] === entry) return false;
        body[at] = entry;
    } else {
        body.push(entry);
    }
    // The value is a Pollinations key, so the file stays owner-only even when
    // it already existed with a looser mode.
    writeTextAtomic(path, `${body.join("\n")}\n`, 0o600);
    return true;
};

/** Drop one variable from an env file; an emptied file is removed. */
export const removeEnvValue = (path: string, name: string) => {
    const text = readTextIfExists(path);
    if (text === null) return false;
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    if (!lines.some((line) => envLinePattern(name).test(line))) return false;
    const body = lines
        .filter((line) => !envLinePattern(name).test(line))
        .filter(
            (line, index, all) =>
                !(index === all.length - 1 && line.trim() === ""),
        );
    if (body.every((line) => line.trim() === "")) removeIfExists(path);
    else writeTextAtomic(path, `${body.join("\n")}\n`, 0o600);
    return true;
};

export interface CodexServerEntry {
    url?: string;
    bearer_token_env_var?: string;
}

/**
 * Minimal reader for Codex's `[mcp_servers.<name>]` tables. Codex's CLI owns
 * that file, so polli only reads `url` and `bearer_token_env_var` from it.
 */
export const readCodexServers = (
    text: string | null,
): Record<string, CodexServerEntry> => {
    const servers: Record<string, CodexServerEntry> = {};
    let current: CodexServerEntry | null = null;
    for (const raw of (text ?? "").split(/\r?\n/)) {
        const line = raw.trim();
        const table = /^\[mcp_servers\.(?:"([^"]+)"|([^\]]+))\]$/.exec(line);
        if (table) {
            const name = (table[1] ?? table[2] ?? "").trim();
            current = {};
            servers[name] = current;
            continue;
        }
        if (line.startsWith("[")) {
            current = null;
            continue;
        }
        if (!current) continue;
        const field =
            /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(
                line,
            );
        if (!field) continue;
        const value = field[2] ?? field[3] ?? field[4] ?? "";
        if (field[1] === "url") current.url = value;
        else if (field[1] === "bearer_token_env_var") {
            current.bearer_token_env_var = value;
        }
    }
    return servers;
};
