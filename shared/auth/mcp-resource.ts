export const MCP_TOOLS_SCOPE = "mcp:tools";

const MCP_RESOURCES = new Set([
    "https://mcp.pollinations.ai",
    "https://staging.mcp.pollinations.ai",
]);

/** Return a canonical Pollinations MCP resource URI, or null when invalid. */
export function normalizeMcpResource(value: unknown): string | null {
    if (typeof value !== "string") return null;

    try {
        const url = new URL(value);
        if (
            url.protocol !== "https:" ||
            url.username ||
            url.password ||
            url.pathname !== "/" ||
            url.search ||
            url.hash
        ) {
            return null;
        }
        const resource = url.origin.toLowerCase();
        return MCP_RESOURCES.has(resource) ? resource : null;
    } catch {
        return null;
    }
}
