import type { TinybirdEventType } from "../schemas/generation-event.ts";

export const MCP_USAGE_HEADERS = {
    cost: "x-pollinations-mcp-cost",
    tool: "x-pollinations-mcp-tool",
    status: "x-pollinations-mcp-status",
    adjustmentId: "x-pollinations-mcp-adjustment-id",
    adjustmentUnits: "x-pollinations-mcp-adjustment-units",
    error: "x-pollinations-mcp-error",
} as const;

export const MCP_CALLER_ID_HEADER = "x-pollinations-mcp-caller-id";

type McpServerDefinitionBase = {
    id: string;
    name: string;
    description: string;
    binding: McpBindingName;
};

export type McpBindingName =
    | "POLLINATIONS_MCP"
    | "FFMPEG_MCP"
    | "PYTHON_MCP"
    | "SANDBOX_MCP"
    | "BROWSER_MCP"
    | "STORAGE_MCP";

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
        binding: "POLLINATIONS_MCP",
        billing: "downstream",
    },
    {
        id: "ffmpeg",
        name: "FFmpeg",
        description:
            "Run FFmpeg against public HTTPS media and return hosted outputs.",
        binding: "FFMPEG_MCP",
        billing: "usage_receipt",
        provider: "cloudflare",
        eventType: "tool.media",
    },
    {
        id: "python",
        name: "Python",
        description:
            "Run short Python calculations in an ephemeral network-disabled container.",
        binding: "PYTHON_MCP",
        billing: "usage_receipt",
        provider: "cloudflare",
        eventType: "tool.code",
    },
    {
        id: "sandbox",
        name: "Sandbox",
        description:
            "Run shell commands and work with files in a short-lived development sandbox.",
        binding: "SANDBOX_MCP",
        billing: "usage_receipt",
        provider: "cloudflare",
        eventType: "tool.code",
    },
    {
        id: "browser",
        name: "Browser",
        description:
            "Fetch rendered web pages as Markdown, screenshots, or PDFs.",
        binding: "BROWSER_MCP",
        billing: "usage_receipt",
        provider: "cloudflare",
        eventType: "tool.browser",
    },
    {
        id: "storage",
        name: "Storage",
        description: "Store and retrieve small files in Pollinations storage.",
        binding: "STORAGE_MCP",
        billing: "downstream",
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
