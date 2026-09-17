import { existsSync, statSync } from "node:fs";
import { readTextIfExists, writeTextAtomic } from "../harnesses/fs.js";
import { BASE_URL } from "../lib/config.js";

export type JsonObject = Record<string, unknown>;

export const readJsonObject = (path: string): JsonObject => {
    const text = readTextIfExists(path);
    if (!text?.trim()) return {};
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(`${path} does not contain a JSON object`);
    }
    return parsed as JsonObject;
};

export const writeJsonObject = (path: string, value: JsonObject) => {
    const text = `${JSON.stringify(value, null, 2)}\n`;
    if (existsSync(path)) {
        const mode = statSync(path).mode & 0o777;
        if (mode !== 0o600) {
            writeTextAtomic(path, text, 0o600);
            return;
        }
    }
    writeTextAtomic(path, text, 0o600);
};

const gatewayPrefix = (baseUrl: string = BASE_URL) => `${baseUrl}/mcp/`;

const collectUrls = (entry: JsonObject, baseUrl: string): string[] => {
    const prefix = gatewayPrefix(baseUrl);
    const urls: string[] = [];
    for (const field of ["url", "serverUrl", "httpUrl"]) {
        const val = entry[field];
        if (typeof val === "string" && val.startsWith(prefix)) urls.push(val);
    }
    return urls;
};

const collectArgs = (entry: JsonObject): string[] => {
    const prefix = gatewayPrefix();
    const args: unknown[] = Array.isArray(entry.args)
        ? entry.args
        : entry.command &&
            typeof entry.command === "object" &&
            Array.isArray((entry.command as JsonObject).args)
          ? ((entry.command as JsonObject).args as unknown[])
          : [];
    return args.filter(
        (a): a is string => typeof a === "string" && a.startsWith(prefix),
    );
};

export const isOwnedEntry = (
    value: unknown,
    baseUrl: string = BASE_URL,
): boolean => {
    if (!value || typeof value !== "object") return false;
    const entry = value as JsonObject;
    return (
        collectUrls(entry, baseUrl).length > 0 || collectArgs(entry).length > 0
    );
};

export const ownedEntryNames = (
    table: unknown,
    baseUrl: string = BASE_URL,
): string[] => {
    if (!table || typeof table !== "object") return [];
    return Object.entries(table as JsonObject)
        .filter(([, value]) => isOwnedEntry(value, baseUrl))
        .map(([name]) => name);
};

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
