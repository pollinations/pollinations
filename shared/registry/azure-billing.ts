import type { BillingRules } from "./registry";

type AzureSearchOutput = {
    usage?: {
        server_tool_use_details?: {
            web_search_requests?: unknown;
        };
    };
    streamEvents?: AzureSearchOutput[];
};

function countWebSearchRequests(output: unknown): number {
    const value = output as AzureSearchOutput | undefined;
    const events = value?.streamEvents ?? (value ? [value] : []);
    for (const event of [...events].reverse()) {
        const count = event.usage?.server_tool_use_details?.web_search_requests;
        if (typeof count === "number" && Number.isFinite(count) && count > 0) {
            return count;
        }
    }
    return 0;
}

export const AZURE_WEB_SEARCH_BILLING: BillingRules = {
    adjustments: [
        {
            id: "azure.bing.web_search.v1",
            description:
                "Azure Grounding with Bing adds $14 / 1K search requests reported by provider usage.",
            kind: "search_request",
            unit: "request",
            unitCost: 14 / 1_000,
            publicPricing: {
                label: "Search",
                quantity: 1_000,
                unit: "search requests",
            },
            countUnits: countWebSearchRequests,
        },
    ],
};
