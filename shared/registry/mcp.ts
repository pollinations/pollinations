import {
    type BillingRateDefinition,
    type PublicPriceInfo,
    publicPriceInfo,
} from "./public-pricing.ts";

export const MCP_USAGE_HEADERS = {
    cost: "x-pollinations-mcp-cost",
    tool: "x-pollinations-mcp-tool",
    status: "x-pollinations-mcp-status",
    adjustmentId: "x-pollinations-mcp-adjustment-id",
    adjustmentUnits: "x-pollinations-mcp-adjustment-units",
    error: "x-pollinations-mcp-error",
} as const;

// Gen overwrites this header before forwarding a user-scoped MCP request.
// Private MCP Workers use it to select the caller's connected accounts.
export const MCP_USER_ID_HEADER = "x-pollinations-user-id";

type McpServerDefinitionBase = {
    id: string;
    name: string;
    description: string;
    binding: McpBindingName;
    pricing: McpPricingDefinition;
    userScoped?: boolean;
    accountPath?: string;
};

type McpPricingDefinition = {
    description?: string;
    rates: readonly BillingRateDefinition[];
};

export type McpPricingInfo = {
    description?: string;
    rates: PublicPriceInfo[];
};

export type McpBindingName =
    | "POLLINATIONS_MCP"
    | "FFMPEG_MCP"
    | "EXA_MCP"
    | "COMPOSIO_MCP";

export type McpServerDefinition = McpServerDefinitionBase &
    (
        | { billing: "downstream" }
        | {
              billing: "usage_receipt";
              provider: string;
          }
    );

export const FFMPEG_MCP_PRICE_PER_SECOND =
    0.25 * 0.00002 + 1 * 0.0000025 + 4 * 0.00000007;

const EXA_SEARCH_PRICE_PER_REQUEST = 0.007;
const EXA_CONTENTS_PRICE_PER_PAGE = 0.001;
export const COMPOSIO_TOOL_CALL_PRICE = 0.0005;
const COMPOSIO_MCP_PRICING = {
    rates: [
        {
            id: "composio.tool_call.v1",
            description: "Connected app tool call",
            kind: "tool_call",
            unit: "call",
            unitCost: COMPOSIO_TOOL_CALL_PRICE,
            publicPricing: {
                label: "Tool call",
                quantity: 1,
                unit: "call",
            },
        },
    ],
} as const;

export const MCP_SERVERS = [
    {
        id: "pollinations",
        name: "Pollinations",
        description:
            "Access Pollinations models and API capabilities through agent tools.",
        binding: "POLLINATIONS_MCP",
        billing: "downstream",
        pricing: {
            description:
                "Generation tools use each selected model's listed rate. Discovery and account tools are free.",
            rates: [],
        },
    },
    {
        id: "ffmpeg",
        name: "FFmpeg",
        description:
            "Trim, convert, resize, compress, and remix audio and video.",
        binding: "FFMPEG_MCP",
        billing: "usage_receipt",
        provider: "cloudflare",
        pricing: {
            rates: [
                {
                    id: "cloudflare.container.basic_runtime.v1",
                    description: "Cloudflare container runtime",
                    kind: "compute",
                    unit: "second",
                    unitCost: FFMPEG_MCP_PRICE_PER_SECOND,
                    publicPricing: {
                        label: "Runtime",
                        quantity: 1,
                        unit: "second",
                    },
                },
            ],
        },
    },
    {
        id: "exa",
        name: "Exa Search",
        description:
            "Search the live web and fetch clean content from source pages.",
        binding: "EXA_MCP",
        billing: "usage_receipt",
        provider: "exa",
        pricing: {
            rates: [
                {
                    id: "exa.search.v1",
                    description: "Exa auto search request",
                    kind: "search_request",
                    unit: "request",
                    unitCost: EXA_SEARCH_PRICE_PER_REQUEST,
                    publicPricing: {
                        label: "Search",
                        quantity: 1,
                        unit: "request",
                        suffix: "up to 10 results",
                    },
                },
                {
                    id: "exa.contents.text.v1",
                    description: "Exa text contents page",
                    kind: "page",
                    unit: "page",
                    unitCost: EXA_CONTENTS_PRICE_PER_PAGE,
                    publicPricing: {
                        label: "Fetch",
                        quantity: 1,
                        unit: "page",
                    },
                },
            ],
        },
    },
    {
        id: "composio",
        name: "Composio",
        description:
            "Use Gmail, Slack, GitHub, Drive, and hundreds of other apps. Agents ask you to connect when needed.",
        binding: "COMPOSIO_MCP",
        billing: "usage_receipt",
        provider: "composio",
        userScoped: true,
        accountPath: "/account#connected-apps",
        pricing: COMPOSIO_MCP_PRICING,
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

export function getMcpPricingInfo(server: McpServerDefinition): McpPricingInfo {
    return {
        description: server.pricing.description,
        rates: server.pricing.rates.map((rate) => publicPriceInfo(rate)),
    };
}
