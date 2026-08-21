import type { TinybirdEventType } from "../schemas/generation-event.ts";

export const MCP_USAGE_HEADERS = {
    cost: "x-pollinations-mcp-cost",
    tool: "x-pollinations-mcp-tool",
    status: "x-pollinations-mcp-status",
    adjustmentId: "x-pollinations-mcp-adjustment-id",
    adjustmentUnits: "x-pollinations-mcp-adjustment-units",
    error: "x-pollinations-mcp-error",
} as const;

export type McpServerDefinition = {
    id: string;
    name: string;
    description: string;
    provider: string;
    eventType: TinybirdEventType;
};

export const MCP_SERVERS = [
    {
        id: "ffmpeg",
        name: "FFmpeg",
        description:
            "Run FFmpeg against media.pollinations.ai inputs and return hosted outputs.",
        provider: "cloudflare",
        eventType: "tool.media",
    },
] as const satisfies readonly McpServerDefinition[];

export function getMcpServerDefinition(
    id: string,
): McpServerDefinition | undefined {
    return MCP_SERVERS.find((server) => server.id === id);
}
