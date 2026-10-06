import type { BillingRules } from "./registry";

const OPENROUTER_CACHE_TTL_HOURS = 5 / 60;
const GEMINI_3_GROUNDING_COST_PER_QUERY = 14 / 1000;
const VERTEX_CACHE_TTL_HOURS = 1;

type GeminiBillingOutput = {
    usage?: {
        cache_creation_input_tokens?: unknown;
        prompt_tokens_details?: {
            cache_write_tokens?: unknown;
        };
        server_tool_use_details?: {
            web_search_requests?: unknown;
        };
    };
    choices?: { groundingMetadata?: GroundingMetadata }[];
    streamEvents?: GeminiBillingOutput[];
};

type GroundingMetadata = {
    webSearchQueries?: string[];
    groundingChunks?: { web?: { uri?: string } }[];
};

function outputEvents(output: unknown): GeminiBillingOutput[] {
    const o = output as GeminiBillingOutput | undefined;
    return Array.isArray(o?.streamEvents) ? o.streamEvents : o ? [o] : [];
}

function eachGroundingMetadata(output: unknown): GroundingMetadata[] {
    const metadata: GroundingMetadata[] = [];
    for (const event of outputEvents(output)) {
        const choices = Array.isArray(event?.choices) ? event.choices : [];
        for (const choice of choices) {
            if (choice?.groundingMetadata)
                metadata.push(choice.groundingMetadata);
        }
    }
    return metadata;
}

function webSearchQueryStrings(metadata: GroundingMetadata): string[] {
    if (!Array.isArray(metadata.webSearchQueries)) return [];
    return metadata.webSearchQueries.filter(
        (query): query is string =>
            typeof query === "string" && query.trim() !== "",
    );
}

// Gemini 3.x charges per distinct search query. Streaming chunks repeat the
// cumulative list, so deduplicate before billing.
function countGeminiWebSearchQueries(output: unknown): number {
    const queries = new Set<string>();
    for (const metadata of eachGroundingMetadata(output)) {
        for (const query of webSearchQueryStrings(metadata)) {
            queries.add(query.trim());
        }
    }
    return queries.size || countOpenRouterWebSearchRequests(output);
}

function positiveUsageCounter(
    select: (event: GeminiBillingOutput) => unknown,
): (output: unknown) => number {
    return (output) => {
        for (const event of [...outputEvents(output)].reverse()) {
            const value = select(event);
            if (
                typeof value === "number" &&
                Number.isFinite(value) &&
                value > 0
            ) {
                return value;
            }
        }
        return 0;
    };
}

const countVertexCacheWriteTokens = positiveUsageCounter(
    (event) =>
        event.usage?.cache_creation_input_tokens ??
        event.usage?.prompt_tokens_details?.cache_write_tokens,
);

// OpenRouter reports the complete cached prefix in cache_write_tokens. Its
// Google routes add five minutes of storage on writes; cache-read token rates
// remain covered by the model's promptCachedTokens price.
const countOpenRouterCacheWriteTokens = positiveUsageCounter(
    (event) => event.usage?.prompt_tokens_details?.cache_write_tokens,
);

// OpenRouter's native web-search tool reports the number of billed searches
// directly in provider usage.
const countOpenRouterWebSearchRequests = positiveUsageCounter(
    (event) => event.usage?.server_tool_use_details?.web_search_requests,
);

// Rates vary per model and route; each registry entry passes the current
// true provider cost. Search is billed per request, cache storage per
// 1M-token-hours prorated to OpenRouter's fixed five-minute cache TTL.
export function openRouterGeminiBilling({
    searchCostPerThousandRequests,
    storageCostPerMillionTokenHours,
}: {
    searchCostPerThousandRequests: number;
    storageCostPerMillionTokenHours: number;
}): BillingRules {
    return {
        adjustments: [
            {
                id: "openrouter.google.web_search.v1",
                description: `OpenRouter web search adds $${searchCostPerThousandRequests} / 1K search requests reported by provider usage.`,
                kind: "search_request",
                unit: "request",
                unitCost: searchCostPerThousandRequests / 1_000,
                publicPricing: {
                    label: "Search",
                    quantity: 1_000,
                    unit: "search requests",
                },
                countUnits: countOpenRouterWebSearchRequests,
            },
            {
                id: "openrouter.google.cache_storage.v1",
                description: `OpenRouter Google cache writes add $${storageCostPerMillionTokenHours} / 1M tokens / hour for the five-minute cache TTL.`,
                kind: "cache_storage",
                unit: "token_hour",
                unitCost:
                    (storageCostPerMillionTokenHours / 1_000_000) *
                    OPENROUTER_CACHE_TTL_HOURS,
                publicPricing: {
                    label: "Cache storage",
                    quantity: 1_000_000,
                    unit: "tokens written",
                    suffix: "5 min",
                },
                countUnits: countOpenRouterCacheWriteTokens,
            },
        ],
    };
}

export function withVertexCacheStorage(
    base: BillingRules,
    storageCostPerMillionTokenHours: number,
): BillingRules {
    return {
        adjustments: [
            ...(base.adjustments ?? []),
            {
                id: "google.vertex.cache_storage.v1",
                description: `Vertex explicit context caching storage: $${storageCostPerMillionTokenHours} / 1M tokens / hour, billed for the one-hour TTL on each cache create.`,
                kind: "cache_storage",
                unit: "token_hour",
                unitCost:
                    (storageCostPerMillionTokenHours / 1_000_000) *
                    VERTEX_CACHE_TTL_HOURS,
                publicPricing: {
                    label: "Cache storage",
                    quantity: 1_000_000,
                    unit: "tokens written",
                    suffix: "1 hour",
                },
                countUnits: countVertexCacheWriteTokens,
            },
        ],
    };
}

export const GEMINI_3_SEARCH_BILLING: BillingRules = {
    adjustments: [
        {
            id: "google.gemini_3.search_query.v1",
            description:
                "Google Search grounding adds $14 / 1K search queries when grounding metadata is present.",
            kind: "search_query",
            unit: "query",
            unitCost: GEMINI_3_GROUNDING_COST_PER_QUERY,
            publicPricing: {
                label: "Search",
                quantity: 1_000,
                unit: "search queries",
            },
            countUnits: countGeminiWebSearchQueries,
        },
    ],
};
