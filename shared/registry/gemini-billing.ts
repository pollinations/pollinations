import type { BillingRules } from "./registry";

const OPENROUTER_GOOGLE_SEARCH_COST_PER_REQUEST = 14 / 1000;
const OPENROUTER_CACHE_TTL_HOURS = 5 / 60;
const GEMINI_25_GROUNDING_COST_PER_PROMPT = 35 / 1000;
const GEMINI_3_GROUNDING_COST_PER_QUERY = 14 / 1000;
const VERTEX_CACHE_TTL_HOURS = 1;

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

type GroundingMetadata = {
    webSearchQueries?: string[];
    groundingChunks?: { web?: { uri?: string } }[];
};

type GroundedOutput = {
    choices?: { groundingMetadata?: GroundingMetadata }[];
    streamEvents?: GroundedOutput[];
};

function outputEvents(output: unknown): CacheWriteOutput[] {
    const o = output as CacheWriteOutput | undefined;
    return Array.isArray(o?.streamEvents) ? o.streamEvents : o ? [o] : [];
}

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
        (query): query is string =>
            typeof query === "string" && query.trim() !== "",
    );
}

function countGeminiGroundedPrompt(output: unknown): number {
    for (const metadata of eachGroundingMetadata(output)) {
        if (webSearchQueryStrings(metadata).length > 0) return 1;
        const chunks = Array.isArray(metadata.groundingChunks)
            ? metadata.groundingChunks
            : [];
        if (chunks.some((chunk) => chunk?.web?.uri)) return 1;
    }
    return 0;
}

function countGeminiWebSearchQueries(output: unknown): number {
    const queries = new Set<string>();
    for (const metadata of eachGroundingMetadata(output)) {
        for (const query of webSearchQueryStrings(metadata)) {
            queries.add(query.trim());
        }
    }
    return queries.size;
}

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
                countUnits: countVertexCacheWriteTokens,
            },
        ],
    };
}

export const GEMINI_25_GROUNDING_BILLING: BillingRules = {
    adjustments: [
        {
            id: "google.gemini_2.grounded_prompt.v1",
            description:
                "Google Search grounding adds $35 / 1K grounded prompts when grounding metadata is present.",
            kind: "grounded_prompt",
            unit: "prompt",
            unitCost: GEMINI_25_GROUNDING_COST_PER_PROMPT,
            countUnits: countGeminiGroundedPrompt,
        },
    ],
};

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
