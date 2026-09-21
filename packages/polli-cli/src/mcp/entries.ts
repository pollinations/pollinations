import { OWNERSHIP_URL } from "../lib/config.js";

/**
 * Entry naming: the "pollinations" server keeps its own name; every other
 * catalog server gets "pollinations-<id>" so ownership is recognizable.
 */
export const entryName = (serverId: string) =>
    serverId === "pollinations" ? "pollinations" : `pollinations-${serverId}`;

/** Inverse of entryName: entry name → catalog server id. */
export const serverIdOf = (name: string) =>
    name === "pollinations"
        ? "pollinations"
        : name.replace(/^pollinations-/, "");

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
            (record[field] as string).startsWith(`${OWNERSHIP_URL}/`),
    );
};

export const ownedNames = (
    servers: Record<string, Record<string, unknown>>,
    ...urlFields: string[]
): string[] =>
    Object.entries(servers)
        .filter(([name, entry]) => isOwnedEntry(name, entry, ...urlFields))
        .map(([name]) => name);

/**
 * Names in `entries` that would clobber an existing non-owned entry under the
 * same name (e.g. the user's own self-hosted "pollinations" server).
 * `install` refuses to overwrite these instead of silently replacing them.
 */
export const clobberedNames = (
    current: Record<string, Record<string, unknown>>,
    entries: Record<string, unknown>,
    ...urlFields: string[]
): string[] =>
    Object.keys(entries).filter((name) => {
        const existing = current[name];
        return (
            existing !== null &&
            typeof existing === "object" &&
            !isOwnedEntry(name, existing, ...urlFields)
        );
    });
