import { existsSync } from "node:fs";
import { join } from "node:path";
import {
    commandExists,
    readTextIfExists,
    resolveHomePath,
    writeTextAtomic,
} from "../harnesses/fs.js";
import { entryName } from "./catalog.js";
import type {
    McpCatalogServer,
    McpClientAdapter,
    McpClientResult,
    McpContext,
} from "./types.js";

const ID = "codex";
const LABEL = "Codex CLI";
/** Codex reads the bearer token from this env var at connect time. */
export const CODEX_KEY_ENV = "POLLINATIONS_MCP_KEY";

const codexHome = (ctx: McpContext) => {
    const configured = ctx.env.CODEX_HOME?.trim();
    if (configured) return resolveHomePath(ctx.home, configured);
    return join(ctx.home, ".codex");
};

const configPath = (ctx: McpContext) => join(codexHome(ctx), "config.toml");

const record = (
    ctx: McpContext,
    servers: string[],
    files: string[],
): McpClientResult => ({
    client: ID,
    label: LABEL,
    servers,
    files,
    detected: existsSync(codexHome(ctx)) || commandExists("codex", ctx.env),
});

/** Our own TOML tables: [mcp_servers."pollinations(-…)"] up to the next table. */
const POLLINATIONS_SECTIONS =
    /\n?\[mcp_servers\."pollinations(?:-[^"]+)?"\][^[]*/gu;

const sectionNames = (text: string): string[] =>
    [...text.matchAll(/\[mcp_servers\."(pollinations(?:-[^"]+)?)"/gu)].map(
        (match) => match[1],
    );

const serverBlock = (server: McpCatalogServer): string =>
    [
        `[mcp_servers."${entryName(server)}"]`,
        `url = "${server.url}"`,
        `bearer_token_env_var = "${CODEX_KEY_ENV}"`,
    ].join("\n");

/**
 * Codex config is TOML, so install rewrites only the Pollinations-owned
 * tables (matched by name) and leaves every other byte of the file alone.
 */
export const codexAdapter: McpClientAdapter = {
    id: ID,
    label: LABEL,
    description: "OpenAI Codex CLI — streamable HTTP in ~/.codex/config.toml",
    detect: (ctx) =>
        existsSync(configPath(ctx)) || commandExists("codex", ctx.env),
    install: (ctx, servers) => {
        const path = configPath(ctx);
        const base = (readTextIfExists(path) ?? "")
            .replace(POLLINATIONS_SECTIONS, "")
            .replace(/\n+$/, "");
        const text = `${base}${base ? "\n\n" : ""}${servers
            .map(serverBlock)
            .join("\n")}\n`;
        writeTextAtomic(path, text, 0o600);
        return record(
            ctx,
            servers.map((s) => s.id),
            [path],
        );
    },
    remove: (ctx) => {
        const path = configPath(ctx);
        const current = readTextIfExists(path);
        if (current === null) return record(ctx, [], []);
        const removed = sectionNames(current);
        if (!removed.length) return record(ctx, [], []);
        writeTextAtomic(
            path,
            current.replace(POLLINATIONS_SECTIONS, "").replace(/^\n+/, ""),
            0o600,
        );
        return record(ctx, removed, [path]);
    },
    status: (ctx) => {
        const path = configPath(ctx);
        const text = readTextIfExists(path);
        return record(
            ctx,
            text ? sectionNames(text) : [],
            text !== null ? [path] : [],
        );
    },
};
