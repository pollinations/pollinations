import { ApiError, gen } from "../lib/api.js";
import { OWNERSHIP_URL } from "../lib/config.js";
import { BASE_URL } from "../lib/config.js";

export interface McpCatalogServer {
    id: string;
    name: string;
    url: string;
}

/**
 * Fetch the live MCP catalog. Public endpoint — the response shape is
 * { data: [{ id, name, url, ... }] } and every server entry carries its own
 * hosted URL (e.g. https://gen.pollinations.ai/mcp/ffmpeg). Only entries
 * whose URL lives under the Pollinations origin are returned, so a
 * compromised catalog response can never redirect a freshly-minted key
 * to a foreign host (defense-in-depth; ownership in install/off relies
 * on the same invariant).
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
                server.url.startsWith(`${OWNERSHIP_URL}/`),
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
