import { ApiError, gen } from "../lib/api.js";

export interface McpCatalogServer {
    id: string;
    name: string;
    url: string;
}

/**
 * Fetch the live MCP catalog. Public endpoint — the response shape is
 * { data: [{ id, name, url, ... }] } and every server entry carries its own
 * hosted URL (e.g. https://gen.pollinations.ai/mcp/ffmpeg).
 */
export const fetchCatalog = async (): Promise<McpCatalogServer[]> => {
    try {
        const data = await gen<{ data?: McpCatalogServer[] }>("/mcp");
        if (!Array.isArray(data?.data)) {
            throw new ApiError(
                502,
                "The /mcp catalog response did not contain a data array — the live shape changed.",
            );
        }
        return data.data.filter(
            (server) =>
                typeof server.id === "string" &&
                typeof server.url === "string" &&
                server.url.startsWith("https://"),
        );
    } catch (error) {
        if (error instanceof ApiError) {
            throw new Error(
                `Could not fetch the Pollinations MCP catalog (${error.status}). Try again later.`,
                { cause: error },
            );
        }
        throw error;
    }
};
