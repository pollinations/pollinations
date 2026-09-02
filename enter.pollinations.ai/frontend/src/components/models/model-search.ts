import { ensureModelQuerySource } from "./model-query.ts";

export const MODEL_CATEGORIES = [
    "all",
    "image",
    "video",
    "3d",
    "audio",
    "realtime",
    "text",
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
    "brand",
    "brand-desc",
] as const;
export type ModelSort = (typeof MODEL_SORTS)[number];

export type ModelSearch = {
    category?: ModelCategory;
    q?: string;
    sort?: ModelSort;
};

function includes<T extends string>(
    values: readonly T[],
    value: unknown,
): value is T {
    return typeof value === "string" && values.includes(value as T);
}

export function validateModelSearch(
    search: Record<string, unknown>,
): ModelSearch {
    const category = includes(MODEL_CATEGORIES, search.category)
        ? search.category
        : "all";
    const sort = includes(MODEL_SORTS, search.sort) ? search.sort : "popular";
    const query = typeof search.q === "string" ? search.q.trim() : "";
    const supportsSource = category !== "agent" && category !== "mcp";

    return {
        category: category === "all" ? undefined : category,
        q: supportsSource ? ensureModelQuerySource(query) : query || undefined,
        sort: sort === "popular" ? undefined : sort,
    };
}
