export const MODEL_CATEGORIES = [
    "all",
    "image",
    "video",
    "3d",
    "audio",
    "realtime",
    "text",
    "decision",
    "embedding",
    "agent",
    "mcp",
] as const;

export type ModelCategory = (typeof MODEL_CATEGORIES)[number];

export const MODEL_SORTS = [
    "popular",
    "newest",
    "price-low",
    "price-high",
    "title",
    "title-desc",
    "publisher",
    "publisher-desc",
] as const;
export type ModelSort = (typeof MODEL_SORTS)[number];

/** Search params shared by the /models and /agents pages. */
export type CatalogSearch = {
    q?: string;
    sort?: ModelSort;
};

export type ModelSearch = CatalogSearch & {
    category?: ModelCategory;
};

/** The /agents page shows agents, or MCP servers with ?view=mcp. */
export type AgentsSearch = CatalogSearch & {
    view?: "mcp";
};

function includes<T extends string>(
    values: readonly T[],
    value: unknown,
): value is T {
    return typeof value === "string" && values.includes(value as T);
}

export function validateCatalogSearch(
    search: Record<string, unknown>,
): CatalogSearch {
    const sort = includes(MODEL_SORTS, search.sort) ? search.sort : "popular";
    const query = typeof search.q === "string" ? search.q.trim() : "";

    return {
        q: query || undefined,
        sort: sort === "popular" ? undefined : sort,
    };
}

export function validateAgentsSearch(
    search: Record<string, unknown>,
): AgentsSearch {
    return {
        ...validateCatalogSearch(search),
        view: search.view === "mcp" ? "mcp" : undefined,
    };
}

export function validateModelSearch(
    search: Record<string, unknown>,
): ModelSearch {
    const category = includes(MODEL_CATEGORIES, search.category)
        ? search.category
        : "all";

    return {
        category: category === "all" ? undefined : category,
        ...validateCatalogSearch(search),
    };
}
