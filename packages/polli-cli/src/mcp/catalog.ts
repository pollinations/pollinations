import { gen } from "../lib/api.js";

export interface McpCatalogEntry {
    id: string;
    name: string;
    description?: string;
    url: string;
    pricing?: {
        description?: string;
        rates?: Array<Record<string, unknown>>;
    };
}

/** The default server installed by `polli mcp install` (models + API tools). */
export const DEFAULT_MCP_SERVER = "pollinations";

/** GET /mcp — public listing of the MCP servers gen exposes. No auth needed. */
export const fetchCatalog = async (): Promise<McpCatalogEntry[]> => {
    const res = await gen<{ data: McpCatalogEntry[] }>("/mcp");
    return res.data ?? [];
};
