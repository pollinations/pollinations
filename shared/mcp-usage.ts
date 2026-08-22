import { MCP_USAGE_HEADERS } from "./registry/mcp.ts";

export type McpUsageReceipt = {
    cost: number;
    tool: string;
    status: number;
    adjustmentId: string;
    adjustmentUnits: number;
    error?: string;
};

export function withMcpUsageHeaders(
    response: Response,
    usage: McpUsageReceipt | undefined,
): Response {
    if (!usage) return response;
    const result = new Response(response.body, response);
    result.headers.set(MCP_USAGE_HEADERS.cost, String(usage.cost));
    result.headers.set(MCP_USAGE_HEADERS.tool, usage.tool);
    result.headers.set(MCP_USAGE_HEADERS.status, String(usage.status));
    result.headers.set(MCP_USAGE_HEADERS.adjustmentId, usage.adjustmentId);
    result.headers.set(
        MCP_USAGE_HEADERS.adjustmentUnits,
        String(usage.adjustmentUnits),
    );
    if (usage.error) {
        result.headers.set(
            MCP_USAGE_HEADERS.error,
            usage.error.replace(/[\r\n]+/g, " ").slice(0, 1000),
        );
    }
    return result;
}
