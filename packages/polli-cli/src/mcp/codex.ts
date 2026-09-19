import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as toml from "smol-toml";
import { readTextIfExists, writeTextAtomic } from "../harnesses/fs.js";
import type { HarnessContext } from "../harnesses/types.js";
import { BASE_URL } from "../lib/config.js";
import type { McpCatalogServer } from "./catalog.js";
import { entryName, serverIdOf } from "./entries.js";
import type { McpClient, McpEntryRef } from "./types.js";

export const CODEX_ENV_VAR = "POLLI_MCP_CODEX_API_KEY";

const codexHome = (ctx: HarnessContext) =>
    ctx.env.CODEX_HOME?.trim()
        ? ctx.env.CODEX_HOME.trim().replace(/^~(?=\/|$)/, ctx.home)
        : join(ctx.home, ".codex");

export const codexConfigPath = (ctx: HarnessContext) =>
    join(codexHome(ctx), "config.toml");

export const codexEnvPath = (ctx: HarnessContext) =>
    join(codexHome(ctx), ".env");

const isOwned = (entry: unknown) =>
    entry !== null &&
    typeof entry === "object" &&
    typeof (entry as Record<string, unknown>).url === "string" &&
    ((entry as Record<string, unknown>).url as string).startsWith(
        `${BASE_URL}/`,
    );

const readToml = (
    path: string,
): Record<string, unknown> | null => {
    const text = readTextIfExists(path);
    if (text === null) return null;
    try {
        return toml.parse(text) as Record<string, unknown>;
    } catch (error) {
        throw new Error(`Could not parse Codex config at ${path}`, {
            cause: error,
        });
    }
};

const readServersFromDisk = (
    ctx: HarnessContext,
): Record<string, Record<string, unknown>> | null => {
    const config = readToml(codexConfigPath(ctx));
    if (config === null) return null;
    const servers = config.mcp_servers;
    if (servers === undefined) return {};
    return servers && typeof servers === "object"
        ? (servers as Record<string, Record<string, unknown>>)
        : {};
};

export const codex: McpClient = {
    id: "codex",
    label: "Codex CLI",
    description:
        "Install Pollinations MCP servers into Codex CLI (~/.codex/config.toml).",
    restartHint: "Restart Codex CLI.",
    secretMode: "env-var-file",
    files: (ctx) => [codexConfigPath(ctx), codexEnvPath(ctx)],
    readServers: (ctx) => readServersFromDisk(ctx),
    writeServers: (ctx, servers) => {
        const path = codexConfigPath(ctx);
        const config = readToml(path) ?? {};
        if (Object.keys(servers).length === 0) delete config.mcp_servers;
        else config.mcp_servers = servers;
        writeTextAtomic(path, `${toml.stringify(config)}\n`);
    },
    entries: (servers: McpCatalogServer[], _apiKey: string) =>
        // Codex reads the bearer token from an env var (plaintext tokens were
        // removed upstream), so the key never lands in config.toml itself.
        Object.fromEntries(
            servers.map((server) => [
                entryName(server.id),
                { url: server.url, bearer_token_env_var: CODEX_ENV_VAR },
            ]),
        ),
    installedServers: (ctx) => {
        const servers = readServersFromDisk(ctx);
        if (!servers) return [];
        return Object.entries(servers)
            .filter(([, entry]) => isOwned(entry))
            .map(([name]) => ({ name, serverId: serverIdOf(name) }));
    },
};

/** Store the key in $CODEX_HOME/.env and return the export hint. */
export const codexPostInstall = (ctx: HarnessContext, apiKey: string) => {
    const path = codexEnvPath(ctx);
    const lines = existsSync(path)
        ? readFileSync(path, "utf-8")
              .split("\n")
              .filter((line) => !line.startsWith(`${CODEX_ENV_VAR}=`))
        : [];
    writeTextAtomic(
        path,
        [...lines.filter((line) => line.trim() !== ""), `${CODEX_ENV_VAR}=${apiKey}`].join(
            "\n",
        ) + "\n",
        0o600,
    );
    return [
        `Bearer token stored as ${CODEX_ENV_VAR} in ${path} — Codex resolves it from that env file; if yours does not, add it to your shell profile.`,
    ];
};

export const codexPostStrip = (ctx: HarnessContext, removed: string[]) => {
    if (removed.length === 0) return [];
    const path = codexEnvPath(ctx);
    if (!existsSync(path)) return [];
    const servers = readServersFromDisk(ctx);
    if (ownedLeft(servers)) return [];
    const lines = readFileSync(path, "utf-8")
        .split("\n")
        .filter((line) => !line.startsWith(`${CODEX_ENV_VAR}=`));
    if (lines.some((line) => line.trim() !== "")) {
        writeTextAtomic(path, lines.join("\n"));
    } else {
        writeTextAtomic(path, `${CODEX_ENV_VAR}=\n`);
    }
    return [`${CODEX_ENV_VAR} removed from ${path}.`];
};

// After a strip, the env var is only obsolete when no Pollinations entry
// remains (any of ours, including harness-written ones).
const ownedLeft = (
    servers: Record<string, Record<string, unknown>> | null,
): boolean =>
    !!servers &&
    Object.values(servers).some(
        (entry) =>
            entry !== null &&
            typeof entry === "object" &&
            typeof (entry as Record<string, unknown>).url === "string" &&
            ((entry as Record<string, unknown>).url as string).startsWith(
                `${BASE_URL}/`,
            ),
    );

export const codexHelpers = { readToml, isOwned };
