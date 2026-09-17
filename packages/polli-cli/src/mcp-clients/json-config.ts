import { chmodSync, existsSync, readFileSync } from "node:fs";
import JSON5 from "json5";
import { writeTextAtomic } from "../harnesses/fs.js";
import { entryName } from "./catalog.js";
import type {
    McpCatalogServer,
    McpClientAdapter,
    McpClientResult,
    McpContext,
} from "./types.js";

type Json = Record<string, unknown>;

/** Load a client config file that may be JSON, JSONC or empty. */
export const loadJsonish = (path: string): Json => {
    if (!existsSync(path)) return {};
    let raw = "";
    try {
        raw = readFileSync(path, "utf-8");
    } catch {
        return {};
    }
    if (!raw.trim()) return {};
    try {
        return JSON5.parse(raw) as Json;
    } catch {
        return {};
    }
};

export const saveJsonish = (path: string, data: Json) => {
    writeTextAtomic(path, `${JSON.stringify(data, null, 2)}\n`);
    // Client configs embed Pollinations API keys: keep them owner-only.
    try {
        chmodSync(path, 0o600);
    } catch {
        // best effort — never fail the install over permissions
    }
};

/** Pollinations owns entries named pollinations-* or pointing at our /mcp URLs. */
export const isPollinationsEntry = (name: string, entry: unknown): boolean => {
    if (name === "pollinations" || name.startsWith("pollinations-")) {
        return true;
    }
    return JSON.stringify(entry ?? {}).includes("gen.pollinations.ai/mcp/");
};

/** Walk/create a nested JSON container, e.g. data.mcpServers. */
export const containerAt = (data: Json, container: string[]): Json => {
    let node = data;
    for (const part of container) {
        const next = node[part];
        if (typeof next !== "object" || next === null || Array.isArray(next)) {
            node[part] = {};
        }
        node = node[part] as Json;
    }
    return node;
};

/** Read a nested JSON container, returning null when absent or not an object. */
export const entriesIn = (data: Json, container: string[]): Json | null => {
    let node: unknown = data;
    for (const part of container) {
        if (typeof node !== "object" || node === null) return null;
        node = (node as Json)[part];
    }
    if (typeof node !== "object" || node === null || Array.isArray(node)) {
        return null;
    }
    return node as Json;
};

const record = (
    id: string,
    label: string,
    files: string[],
    servers: string[],
    detected: boolean,
): McpClientResult => ({
    client: id,
    label,
    servers,
    files,
    detected,
});

/**
 * Factory for clients whose config is a JSON/JSONC file with a map of MCP
 * servers under a fixed container path (Claude Code, Cursor, Gemini CLI,
 * Claude Desktop, OpenCode, Cline, Windsurf, Kiro). Install merges entries
 * in; remove strips only Pollinations-owned ones.
 */
export const fileAdapter = (spec: {
    id: string;
    label: string;
    description: string;
    configPath: (ctx: McpContext) => string;
    /** JSON path to the servers container, e.g. ["mcpServers"]. */
    container: string[];
    buildEntry: (server: McpCatalogServer, key: string) => unknown;
    /** Override the default "config file exists" presence check. */
    detect?: (ctx: McpContext) => boolean;
}): McpClientAdapter => ({
    id: spec.id,
    label: spec.label,
    description: spec.description,
    detect: spec.detect ?? ((ctx) => existsSync(spec.configPath(ctx))),
    install: (ctx, servers, key) => {
        const path = spec.configPath(ctx);
        const data = loadJsonish(path);
        const node = containerAt(data, spec.container);
        for (const server of servers) {
            node[entryName(server)] = spec.buildEntry(server, key);
        }
        saveJsonish(path, data);
        return record(
            spec.id,
            spec.label,
            [path],
            servers.map((s) => s.id),
            true,
        );
    },
    remove: (ctx) => {
        const path = spec.configPath(ctx);
        if (!existsSync(path))
            return record(spec.id, spec.label, [], [], false);
        const data = loadJsonish(path);
        const entries = entriesIn(data, spec.container) ?? {};
        const servers: string[] = [];
        for (const name of Object.keys(entries)) {
            if (isPollinationsEntry(name, entries[name])) {
                delete entries[name];
                servers.push(name);
            }
        }
        if (servers.length) saveJsonish(path, data);
        return record(
            spec.id,
            spec.label,
            servers.length ? [path] : [],
            servers,
            true,
        );
    },
    status: (ctx) => {
        const path = spec.configPath(ctx);
        const data = loadJsonish(path);
        const entries = entriesIn(data, spec.container) ?? {};
        const servers = Object.keys(entries).filter((name) =>
            isPollinationsEntry(name, entries[name]),
        );
        return record(
            spec.id,
            spec.label,
            existsSync(path) ? [path] : [],
            servers,
            existsSync(path),
        );
    },
});
