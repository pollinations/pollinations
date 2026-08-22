import type { TinybirdEventType } from "../schemas/generation-event.ts";

export const MCP_USAGE_HEADERS = {
    cost: "x-pollinations-mcp-cost",
    tool: "x-pollinations-mcp-tool",
    status: "x-pollinations-mcp-status",
    adjustmentId: "x-pollinations-mcp-adjustment-id",
    adjustmentUnits: "x-pollinations-mcp-adjustment-units",
    error: "x-pollinations-mcp-error",
} as const;

type McpServerDefinitionBase = {
    id: string;
    name: string;
    description: string;
};

export type McpServerDefinition = McpServerDefinitionBase &
    (
        | { billing: "downstream" }
        | {
              billing: "usage_receipt";
              provider: string;
              eventType: TinybirdEventType;
          }
    );

export const MCP_SERVERS = [
    {
        id: "pollinations",
        name: "Pollinations",
        description:
            "Generate text, images, audio, video, embeddings, and 3D assets with Pollinations.",
        billing: "downstream",
    },
    {
        id: "ffmpeg",
        name: "FFmpeg",
        description:
            "Run FFmpeg against public HTTPS media and return hosted outputs.",
        billing: "usage_receipt",
        provider: "cloudflare",
        eventType: "tool.media",
    },
] as const satisfies readonly McpServerDefinition[];

export type McpServerId = (typeof MCP_SERVERS)[number]["id"];
export const MCP_SERVER_IDS = MCP_SERVERS.map(({ id }) => id) as [
    McpServerId,
    ...McpServerId[],
];

export function getMcpServerDefinition(
    id: string,
): McpServerDefinition | undefined {
    return MCP_SERVERS.find((server) => server.id === id);
}
