import JSON5 from "json5";
import {
    readTextIfExists,
    resolveHomePath,
    writeTextAtomic,
} from "../harnesses/fs.js";
import type { HarnessContext } from "../harnesses/types.js";
import type { McpCatalogServer } from "./catalog.js";
import { entryName, isOwnedEntry } from "./entries.js";
import type { McpClient } from "./types.js";

export const readJson = (
    path: string,
    what: string,
): Record<string, unknown> | null => {
    const text = readTextIfExists(path);
    if (text === null) return null;
    if (text.trim() === "") return {};
    try {
        const parsed = JSON5.parse(text);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
    } catch (error) {
        throw new Error(`Could not parse ${what} config at ${path}`, {
            cause: error,
        });
    }
    throw new Error(`${what} config at ${path} must contain an object`);
};

export const writeJson = (path: string, data: unknown) =>
    writeTextAtomic(path, `${JSON.stringify(data, null, 2)}\n`, 0o600);

export const AUTH_HEADER = "Authorization";
export const VS_CODE_INPUT_ID = "pollinations-api-key";

export interface JsonClientSpec {
    id: string;
    label: string;
    description: string;
    restartHint: string;
    /** Root key holding the servers map: mcpServers | servers | mcp. */
    envelopeKey: string;
    urlField: string;
    typeField?: { name: string; value: string };
    /** Extra fixed fields on every entry (e.g. OpenCode's enabled: true). */
    extraFields?: Record<string, unknown>;
    secretMode: "literal" | "input";
    configPath: (ctx: HarnessContext) => string;
    /** Optional config fixup right before writing (e.g. VS Code inputs). */
    finalize?: (config: Record<string, unknown>) => void;
}

const isMap = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);

const serversMap = (
    config: Record<string, unknown> | null,
    envelopeKey: string,
): Record<string, unknown> =>
    config && isMap(config[envelopeKey])
        ? (config[envelopeKey] as Record<string, unknown>)
        : {};

export const entryFor = (
    spec: {
        urlField: string;
        typeField?: { name: string; value: string };
        extraFields?: Record<string, unknown>;
    },
    server: McpCatalogServer,
    apiKey: string,
    secretMode: "literal" | "input",
): Record<string, unknown> => {
    const entry: Record<string, unknown> = {};
    if (spec.typeField) entry[spec.typeField.name] = spec.typeField.value;
    entry[spec.urlField] = server.url;
    for (const [name, value] of Object.entries(spec.extraFields ?? {})) {
        entry[name] = value;
    }
    entry.headers = {
        Authorization:
            secretMode === "input"
                ? `\${input:${VS_CODE_INPUT_ID}}`
                : `Bearer ${apiKey}`,
    };
    return entry;
};

/**
 * Build a JSON-envelope client from its descriptor. The adapter is mechanical:
 * read the servers map under envelopeKey, upsert/strip Pollinations-owned
 * entries (owned = URL under OWNERSHIP_URL), preserve the rest of the config.
 */
export const jsonClient = (spec: JsonClientSpec): McpClient => {
    const path = (ctx: HarnessContext) => spec.configPath(ctx);
    return {
        id: spec.id,
        label: spec.label,
        description: spec.description,
        restartHint: spec.restartHint,
        secretMode: spec.secretMode,
        files: (ctx) => [path(ctx)],
        readServers: (ctx) => {
            const config = readJson(path(ctx), spec.label);
            if (config === null) return null;
            const current = config[spec.envelopeKey];
            return isMap(current)
                ? (Object.fromEntries(
                      Object.entries(current).filter(([, entry]) =>
                          isMap(entry),
                      ),
                  ) as Record<string, Record<string, unknown>>)
                : {};
        },
        writeServers: (ctx, servers) => {
            const config = readJson(path(ctx), spec.label) ?? {};
            if (Object.keys(servers).length === 0)
                delete config[spec.envelopeKey];
            else config[spec.envelopeKey] = servers;
            spec.finalize?.(config);
            writeTextAtomic(
                path(ctx),
                `${JSON.stringify(config, null, 2)}\n`,
                0o600,
            );
        },
        entries: (servers, apiKey) =>
            Object.fromEntries(
                servers.map((server) => [
                    entryName(server.id),
                    entryFor(spec, server, apiKey, spec.secretMode),
                ]),
            ),
        installedServers: (ctx) => {
            const servers = serversMap(
                readJson(path(ctx), spec.label),
                spec.envelopeKey,
            );
            return Object.entries(servers)
                .filter(([name, entry]) =>
                    isOwnedEntry(name, entry, spec.urlField),
                )
                .map(([name]) => ({ name, serverId: serverIdOf(name) }));
        },
        readKey:
            spec.secretMode === "input"
                ? undefined
                : (ctx) => {
                      const servers = serversMap(
                          readJson(path(ctx), spec.label),
                          spec.envelopeKey,
                      );
                      for (const entry of Object.values(servers)) {
                          if (
                              !isMap(entry) ||
                              !isOwnedEntry("", entry, spec.urlField)
                          )
                              continue;
                          const headers = entry.headers;
                          if (isMap(headers)) {
                              const auth = headers[AUTH_HEADER];
                              if (typeof auth === "string") {
                                  return auth.replace(/^Bearer\s+/, "");
                              }
                          }
                      }
                      return null;
                  },
    };
};

export const serverIdOf = (name: string) =>
    name === "pollinations"
        ? "pollinations"
        : name.replace(/^pollinations-/, "");

export { resolveHomePath };
