import { gen } from "../lib/api.js";
import { BASE_URL } from "../lib/config.js";

export interface McpServer {
    id: string;
    name: string;
    description: string;
    url: string;
}

const SERVER_PATH = "/mcp/";

/** Server ids end up in shell commands, so only allow a shell-safe charset. */
const SERVER_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

export const serverUrl = (id: string) => `${BASE_URL}${SERVER_PATH}${id}`;

/**
 * Server id when a string points at a Pollinations-hosted MCP server. Owned
 * entries in a client config are recognised by their URL, so we never need to
 * leave a marker key inside someone else's file.
 */
export const ownedServerId = (
    value: unknown,
    base = BASE_URL,
): string | null => {
    if (typeof value !== "string") return null;
    const prefix = `${base}${SERVER_PATH}`;
    if (!value.startsWith(prefix)) return null;
    const id = value.slice(prefix.length).replace(/\/+$/u, "");
    return SERVER_ID.test(id) ? id : null;
};

/** Live catalog from the gateway, so new servers need no CLI release. */
export const fetchMcpCatalog = async (): Promise<McpServer[]> => {
    const catalog = await gen<{ data?: unknown }>("/mcp");
    const entries = Array.isArray(catalog.data) ? catalog.data : [];
    return entries.filter(isRecord).flatMap((entry) => {
        const id = entry.id;
        if (typeof id !== "string" || !SERVER_ID.test(id)) return [];
        const url = entry.url;
        const owned = ownedServerId(url);
        return [
            {
                id,
                name: typeof entry.name === "string" ? entry.name : id,
                description:
                    typeof entry.description === "string"
                        ? entry.description
                        : "",
                url: owned ? (url as string) : serverUrl(id),
            },
        ];
    });
};
