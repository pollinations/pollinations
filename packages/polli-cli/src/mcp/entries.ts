import type { McpCatalogServer } from "./catalog.js";
import { BASE_URL } from "../lib/config.js";

/**
 * Entry naming: the "pollinations" server keeps its own name; every other
 * catalog server gets "pollinations-<id>" so ownership is recognizable.
 */
export const entryName = (serverId: string) =>
    serverId === "pollinations" ? "pollinations" : `pollinations-${serverId}`;

/** Inverse of entryName: entry name → catalog server id. */
export const serverIdOf = (name: string) =>
    name === "pollinations" ? "pollinations" : name.replace(/^pollinations-/, "");

/**
 * An entry is Pollinations-owned iff its URL lives under the Pollinations
 * base URL. Name alone is not enough: a user may run their own "pollinations"
 * server with a different URL.
 */
export const isOwnedEntry = (
    _name: string,
    entry: unknown,
    ...urlFields: string[]
): boolean => {
    if (entry === null || typeof entry !== "object") return false;
    const record = entry as Record<string, unknown>;
    return urlFields.some(
        (field) =>
            typeof record[field] === "string" &&
            (record[field] as string).startsWith(`${BASE_URL}/`),
    );
};

export const ownedNames = (
    servers: Record<string, Record<string, unknown>>,
    ...urlFields: string[]
): string[] =>
    Object.entries(servers)
        .filter(([name, entry]) => isOwnedEntry(name, entry, ...urlFields))
        .map(([name]) => name);
