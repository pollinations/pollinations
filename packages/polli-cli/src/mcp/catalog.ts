import { gen } from "../lib/api.js";

export interface McpServer {
    id: string;
    name: string;
    description?: string;
    url: string;
    pricing?: unknown;
}

export const fetchMcpCatalog = async (): Promise<McpServer[]> => {
    const response = await gen<{ data: McpServer[] }>("/mcp");
    return (response.data ?? []).filter((s) => Boolean(s.id) && Boolean(s.url));
};

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
            const known = catalog.map((e) => e.id).join(", ");
            throw new Error(`Unknown MCP server "${id}". Available: ${known}`);
        }
        return server;
    });
};
