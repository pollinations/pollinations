import type { TinybirdEventType } from "../schemas/generation-event.ts";
import {
    type PublicPriceInfo,
    type PublicPricingDefinition,
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

type McpServerDefinitionBase = {
    id: string;
    name: string;
    description: string;
    binding: McpBindingName;
    pricing: McpPricingDefinition;
};

type McpPriceDefinition = {
    name: string;
    kind: string;
    unitPrice: number;
    publicPricing: PublicPricingDefinition;
};

type McpPricingDefinition = {
    description: string;
    rates: readonly McpPriceDefinition[];
};

export type McpPricingInfo = {
    description: string;
    rates: PublicPriceInfo[];
};

export type McpBindingName = "POLLINATIONS_MCP" | "FFMPEG_MCP" | "EXA_MCP";

export type McpServerDefinition = McpServerDefinitionBase &
    (
        | { billing: "downstream" }
        | {
              billing: "usage_receipt";
              provider: string;
              eventType: TinybirdEventType;
          }
    );

export const FFMPEG_MCP_PRICE_PER_SECOND =
    0.25 * 0.00002 + 1 * 0.0000025 + 4 * 0.00000007;

const EXA_SEARCH_PRICE_PER_REQUEST = 0.007;
const EXA_SEARCH_EXTRA_RESULT_PRICE = 0.001;
const EXA_CONTENTS_PRICE_PER_PAGE = 0.001;

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
        eventType: "tool.media",
        pricing: {
            description: "Billed for active FFmpeg runtime.",
            rates: [
                {
                    name: "cloudflare.container.basic_runtime.v1",
                    kind: "compute",
                    unitPrice: FFMPEG_MCP_PRICE_PER_SECOND,
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
        eventType: "tool.search",
        pricing: {
            description: "Billed at Exa's reported cost.",
            rates: [
                {
                    name: "exa.search.v1",
                    kind: "search_request",
                    unitPrice: EXA_SEARCH_PRICE_PER_REQUEST,
                    publicPricing: {
                        label: "Search",
                        quantity: 1,
                        unit: "request",
                        suffix: "up to 10 results",
                    },
                },
                {
                    name: "exa.search.extra_result.v1",
                    kind: "search_result",
                    unitPrice: EXA_SEARCH_EXTRA_RESULT_PRICE,
                    publicPricing: {
                        label: "Extra result",
                        quantity: 1,
                        unit: "result",
                        suffix: "after 10",
                    },
                },
                {
                    name: "exa.contents.text.v1",
                    kind: "page",
                    unitPrice: EXA_CONTENTS_PRICE_PER_PAGE,
                    publicPricing: {
                        label: "Fetch",
                        quantity: 1,
                        unit: "page",
                    },
                },
            ],
        },
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
        rates: server.pricing.rates.map(publicPriceInfo),
    };
}
