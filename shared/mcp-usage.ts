import { MCP_USAGE_HEADERS } from "./registry/mcp.ts";

export type McpUsageReceipt = {
    cost: number;
    tool: string;
    status: number;
    adjustmentId: string;
    adjustmentUnits: number;
    error?: string;
};

export function parseMcpUsageHeaders(
    headers: Headers,
): McpUsageReceipt | undefined {
    const costHeader = headers.get(MCP_USAGE_HEADERS.cost);
    if (costHeader === null) return undefined;

    const receipt = {
        cost: Number(costHeader),
        status: Number(headers.get(MCP_USAGE_HEADERS.status)),
        adjustmentUnits: Number(headers.get(MCP_USAGE_HEADERS.adjustmentUnits)),
        tool: headers.get(MCP_USAGE_HEADERS.tool),
        adjustmentId: headers.get(MCP_USAGE_HEADERS.adjustmentId),
        error: headers.get(MCP_USAGE_HEADERS.error) ?? undefined,
    };
    if (
        !Number.isFinite(receipt.cost) ||
        receipt.cost < 0 ||
        !Number.isInteger(receipt.status) ||
        receipt.status < 100 ||
        receipt.status > 599 ||
        !Number.isFinite(receipt.adjustmentUnits) ||
        receipt.adjustmentUnits < 0 ||
        !receipt.tool ||
        !receipt.adjustmentId
    ) {
        throw new Error("MCP server returned invalid usage metadata");
    }
    return receipt as McpUsageReceipt;
}

export function withMcpUsageHeaders(
    response: Response,
    receipt: McpUsageReceipt | undefined,
): Response {
    if (!receipt) return response;
    const result = new Response(response.body, response);
    result.headers.set(MCP_USAGE_HEADERS.cost, String(receipt.cost));
    result.headers.set(MCP_USAGE_HEADERS.tool, receipt.tool);
    result.headers.set(MCP_USAGE_HEADERS.status, String(receipt.status));
    result.headers.set(MCP_USAGE_HEADERS.adjustmentId, receipt.adjustmentId);
    result.headers.set(
        MCP_USAGE_HEADERS.adjustmentUnits,
        String(receipt.adjustmentUnits),
    );
    if (receipt.error) {
        result.headers.set(
            MCP_USAGE_HEADERS.error,
            receipt.error.replace(/[\r\n]+/g, " ").slice(0, 1000),
        );
    }
    return result;
}
