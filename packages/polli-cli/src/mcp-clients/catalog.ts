import { BASE_URL } from "../lib/config.js";
import type { McpCatalogServer } from "./types.js";

const CATALOG_URL = `${BASE_URL}/mcp`;

/** The live MCP server catalog — new servers appear without a CLI release. */
export const fetchMcpCatalog = async (): Promise<McpCatalogServer[]> => {
    const res = await fetch(CATALOG_URL);
    if (!res.ok) {
        throw new Error(
            `${res.status} ${res.statusText}: failed to fetch the MCP catalog`,
        );
    }
    const data = (await res.json()) as {
        data?: Array<Partial<McpCatalogServer>>;
    };
    return (data.data ?? [])
        .filter((s): s is McpCatalogServer => Boolean(s.id && s.url))
        .map((s) => ({
            id: s.id,
            name: s.name ?? s.id,
            description: s.description,
            url: s.url,
        }));
};

/** Config entry name for a catalog server: `pollinations` stays unprefixed. */
export const entryName = (server: McpCatalogServer): string =>
    server.id === "pollinations" || server.id.startsWith("pollinations-")
        ? server.id
        : `pollinations-${server.id}`;
