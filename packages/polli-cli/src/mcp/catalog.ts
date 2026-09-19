import { gen } from "../lib/api.js";

/** One entry of the live MCP server catalog served by the gen gateway. */
export interface McpServer {
    id: string;
    name: string;
    description?: string;
    url: string;
}

/**
 * Fetch the live MCP catalog. The CLI hardcodes no server list — the gateway
 * decides which servers exist and which URL each is served at.
 */
export const fetchMcpCatalog = async (): Promise<McpServer[]> => {
    const response = await gen<{ data: McpServer[] }>("/mcp");
    return (response.data ?? []).filter(
        (server) => Boolean(server.id) && Boolean(server.url),
    );
};

/** Resolve requested server ids/names against the catalog, in request order. */
export const resolveServers = (
    catalog: McpServer[],
    requested: string[] | undefined,
): McpServer[] => {
    if (!requested || requested.length === 0) return catalog;
    return requested.map((id) => {
        const server = catalog.find(
            (entry) => entry.id === id || entry.name === id,
        );
        if (!server) {
            const known = catalog.map((entry) => entry.id).join(", ");
            throw new Error(
                `Unknown MCP server "${id}". Available servers: ${known}`,
            );
        }
        return server;
    });
};
