import { gen } from "../lib/api.js";

/** One Pollinations-hosted MCP server, as published by the live catalog. */
export interface McpServer {
    id: string;
    name: string;
    description?: string;
    url: string;
}

/**
 * Live catalog of Pollinations MCP servers (`GET /mcp`). Nothing about the
 * server list is hardcoded in the CLI — the endpoint is public, so this works
 * before login and stays correct when servers are added or removed.
 */
export const fetchMcpCatalog = async (): Promise<McpServer[]> => {
    const body = await gen<{ data?: McpServer[] }>("/mcp");
    return (body.data ?? [])
        .filter(
            (server) =>
                typeof server?.id === "string" &&
                typeof server?.url === "string",
        )
        .map((server) => ({ ...server, name: server.name ?? server.id }));
};

export interface ResolvedServers {
    servers: McpServer[];
    unknown: string[];
}

/** Match requested ids (or display names, case-insensitive) against the catalog. */
export const resolveServers = (
    catalog: McpServer[],
    requested: string[],
): ResolvedServers => {
    const byName = new Map<string, McpServer>();
    for (const server of catalog) {
        byName.set(server.id.toLowerCase(), server);
        byName.set(server.name.toLowerCase(), server);
    }

    const servers: McpServer[] = [];
    const unknown: string[] = [];
    for (const wanted of requested) {
        const match = byName.get(wanted.trim().toLowerCase());
        if (!match) {
            unknown.push(wanted);
            continue;
        }
        if (!servers.some((server) => server.id === match.id))
            servers.push(match);
    }

    return { servers, unknown };
};
