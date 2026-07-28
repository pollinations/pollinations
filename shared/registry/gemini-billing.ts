import type { BillingRules } from "./registry";

const OPENROUTER_GOOGLE_SEARCH_COST_PER_REQUEST = 14 / 1000;
const OPENROUTER_CACHE_TTL_HOURS = 5 / 60;

type CacheWriteOutput = {
    usage?: {
        prompt_tokens_details?: {
            cache_write_tokens?: unknown;
        };
        server_tool_use_details?: {
            web_search_requests?: unknown;
        };
    };
    streamEvents?: CacheWriteOutput[];
};

function outputEvents(output: unknown): CacheWriteOutput[] {
    const o = output as CacheWriteOutput | undefined;
    return Array.isArray(o?.streamEvents) ? o.streamEvents : o ? [o] : [];
}

// OpenRouter reports the complete cached prefix in cache_write_tokens. Its
// Google routes add five minutes of storage on writes; cache-read token rates
// remain covered by the model's promptCachedTokens price.
function countOpenRouterCacheWriteTokens(output: unknown): number {
    for (const event of [...outputEvents(output)].reverse()) {
        const value = event?.usage?.prompt_tokens_details?.cache_write_tokens;
        if (typeof value === "number" && Number.isFinite(value) && value > 0) {
            return value;
        }
    }
    return 0;
}

// OpenRouter's native web-search tool reports the number of billed searches
// directly in provider usage.
function countOpenRouterWebSearchRequests(output: unknown): number {
    for (const event of [...outputEvents(output)].reverse()) {
        const value =
            event?.usage?.server_tool_use_details?.web_search_requests;
        if (typeof value === "number" && Number.isFinite(value) && value > 0) {
            return value;
        }
    }
    return 0;
}

export function withOpenRouterGeminiCacheStorage(
    base: BillingRules,
    storageCostPerMillionTokenHours: number,
): BillingRules {
    return {
        adjustments: [
            ...(base.adjustments ?? []),
            {
                id: "openrouter.google.cache_storage.v1",
                description: `OpenRouter Google cache writes add $${storageCostPerMillionTokenHours} / 1M tokens / hour for the five-minute cache TTL.`,
                kind: "cache_storage",
                unit: "token_hour",
                unitCost:
                    (storageCostPerMillionTokenHours / 1_000_000) *
                    OPENROUTER_CACHE_TTL_HOURS,
                countUnits: countOpenRouterCacheWriteTokens,
            },
        ],
    };
}

export const OPENROUTER_GEMINI_SEARCH_BILLING: BillingRules = {
    adjustments: [
        {
            id: "openrouter.google.web_search.v1",
            description:
                "OpenRouter native Google Search adds $14 / 1K search requests reported by provider usage.",
            kind: "search_request",
            unit: "request",
            unitCost: OPENROUTER_GOOGLE_SEARCH_COST_PER_REQUEST,
            countUnits: countOpenRouterWebSearchRequests,
        },
    ],
};
