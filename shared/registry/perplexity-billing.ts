import type { BillingRules } from "./registry";

// Agent API web_search, per invocation. A request can search any number of
// times, including none.
const WEB_SEARCH_COST_PER_THOUSAND = 2.5;

type SearchUsage = {
    tool_calls_details?: { search_web?: { invocation?: unknown } };
    server_tool_use_details?: { web_search_requests?: unknown };
};

type UsageEvent = {
    usage?: SearchUsage | null;
    response?: { usage?: SearchUsage | null };
};

/**
 * Searches the provider reported. Native Responses usage (a response or its
 * `response.completed` event) carries `tool_calls_details`; the Chat adapter
 * passes the same count on as `server_tool_use_details`.
 */
function countWebSearches(output: unknown): number {
    const o = output as { streamEvents?: unknown } | undefined;
    const events = (
        Array.isArray(o?.streamEvents) ? o.streamEvents : [output]
    ) as UsageEvent[];
    for (const event of [...events].reverse()) {
        const usage = event?.usage ?? event?.response?.usage;
        const count =
            usage?.tool_calls_details?.search_web?.invocation ??
            usage?.server_tool_use_details?.web_search_requests;
        if (typeof count === "number" && Number.isInteger(count) && count > 0)
            return count;
    }
    return 0;
}

export const PERPLEXITY_WEB_SEARCH_BILLING: BillingRules = {
    adjustments: [
        {
            id: "perplexity.web_search.v1",
            description: `Perplexity web search adds $${WEB_SEARCH_COST_PER_THOUSAND} / 1K searches.`,
            kind: "search_request",
            unit: "request",
            unitCost: WEB_SEARCH_COST_PER_THOUSAND / 1_000,
            publicPricing: {
                label: "Search",
                quantity: 1_000,
                unit: "searches",
            },
            countUnits: countWebSearches,
        },
    ],
};
