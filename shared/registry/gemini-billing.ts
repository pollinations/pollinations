import type { BillingRules } from "./registry";

const GEMINI_3_GROUNDING_COST_PER_QUERY = 14 / 1000;

// The gateway creates Vertex cachedContents resources with a 1-hour TTL, so
// one cache create bills exactly one hour of storage per cached token.
const VERTEX_CACHE_TTL_HOURS = 1;
const OPENROUTER_CACHE_TTL_HOURS = 5 / 60;
const FLASH_CACHE_STORAGE_COST_PER_MILLION_TOKEN_HOURS = 1;

type GroundingMetadata = {
    webSearchQueries?: string[];
};

type GroundedOutput = {
    choices?: { groundingMetadata?: GroundingMetadata }[];
    streamEvents?: GroundedOutput[];
};

// Counters walk raw provider output and must never throw — a throw here
// happens before the deduction/event path in track.ts, so it would skip
// billing AND the tracking event. Guard every shape assumption.
function eachGroundingMetadata(output: unknown): GroundingMetadata[] {
    const o = output as GroundedOutput | undefined;
    const events = Array.isArray(o?.streamEvents)
        ? o.streamEvents
        : o
          ? [o]
          : [];
    const metadata: GroundingMetadata[] = [];
    for (const event of events) {
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
        (q): q is string => typeof q === "string" && q.trim() !== "",
    );
}

// Gemini 3.x: each distinct web-search query fires a fee. Dedup the cumulative
// query list across stream chunks (chunks repeat the running list).
function countGeminiWebSearchQueries(output: unknown): number {
    const queries = new Set<string>();
    for (const metadata of eachGroundingMetadata(output)) {
        for (const q of webSearchQueryStrings(metadata)) {
            queries.add(q.trim());
        }
    }
    return queries.size;
}

type CacheWriteOutput = {
    usage?: {
        cache_creation_input_tokens?: unknown;
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

// Vertex explicit context caching: cache-creating responses report the cached
// prefix size as `usage.cache_creation_input_tokens` (Anthropic convention,
// set by our gateway fork). One create × 1-hour TTL = one token-hour per
// cached token. Cache reads/hits report `cached_tokens` instead and are
// covered by the linear promptCachedTokens price, not this rule.
function countVertexCacheWriteTokens(output: unknown): number {
    for (const event of [...outputEvents(output)].reverse()) {
        const value = event?.usage?.cache_creation_input_tokens;
        if (typeof value === "number" && Number.isFinite(value) && value > 0) {
            return value;
        }
    }
    return 0;
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
// directly instead of returning Vertex groundingMetadata.
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

// Storage rates from the GCP Billing Catalog (Vertex AI SKUs "<model> Text
// Input Caching Storage", verified 2026-07-03): $1.00/M token-hours for every
// Flash/Flash-Lite family, $4.50/M for Pro.
export function withVertexCacheStorage(
    base: BillingRules,
    storageCostPerMillionTokenHours: number,
): BillingRules {
    return {
        adjustments: [
            ...(base.adjustments ?? []),
            {
                id: "google.vertex.cache_storage.v1",
                description: `Vertex explicit context caching storage: $${storageCostPerMillionTokenHours} / 1M tokens / hour, billed for the 1-hour TTL on each cache create.`,
                kind: "cache_storage",
                unit: "token_hour",
                unitCost:
                    (storageCostPerMillionTokenHours / 1_000_000) *
                    VERTEX_CACHE_TTL_HOURS,
                countUnits: countVertexCacheWriteTokens,
            },
        ],
    };
}

export function withOpenRouterGeminiCacheStorage(
    base: BillingRules,
): BillingRules {
    return {
        adjustments: [
            ...(base.adjustments ?? []),
            {
                id: "openrouter.google.cache_storage.v1",
                description:
                    "OpenRouter Google cache writes add $1 / 1M tokens / hour for the five-minute cache TTL.",
                kind: "cache_storage",
                unit: "token_hour",
                unitCost:
                    (FLASH_CACHE_STORAGE_COST_PER_MILLION_TOKEN_HOURS /
                        1_000_000) *
                    OPENROUTER_CACHE_TTL_HOURS,
                countUnits: countOpenRouterCacheWriteTokens,
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
            countUnits: countGeminiWebSearchQueries,
        },
    ],
};

export const OPENROUTER_GEMINI_SEARCH_BILLING: BillingRules = {
    adjustments: [
        {
            id: "openrouter.google.web_search.v1",
            description:
                "OpenRouter native Google Search adds $14 / 1K search requests reported by provider usage.",
            kind: "search_request",
            unit: "request",
            unitCost: GEMINI_3_GROUNDING_COST_PER_QUERY,
            countUnits: countOpenRouterWebSearchRequests,
        },
    ],
};
