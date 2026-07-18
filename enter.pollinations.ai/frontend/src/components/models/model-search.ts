export const MODEL_CATEGORIES = [
    "all",
    "image",
    "video",
    "3d",
    "audio",
    "realtime",
    "text",
    "community-text",
    "community-image",
    "community-embedding",
    "embedding",
] as const;

export type ModelCategory = (typeof MODEL_CATEGORIES)[number];

export const MODEL_SORT_KEYS = [
    "name",
    "perPollen",
    "input",
    "output",
] as const;
export type ModelSortKey = (typeof MODEL_SORT_KEYS)[number];

export const MODEL_SORT_DIRECTIONS = ["asc", "desc"] as const;
export type ModelSortDirection = (typeof MODEL_SORT_DIRECTIONS)[number];

export type ModelSearch = {
    category?: ModelCategory;
    q?: string;
    sort?: ModelSortKey;
    dir?: ModelSortDirection;
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
    return {
        category:
            includes(MODEL_CATEGORIES, search.category) &&
            search.category !== "all"
                ? search.category
                : undefined,
        q:
            typeof search.q === "string" && search.q.length > 0
                ? search.q
                : undefined,
        sort:
            includes(MODEL_SORT_KEYS, search.sort) &&
            search.sort !== "perPollen"
                ? search.sort
                : undefined,
        dir: includes(MODEL_SORT_DIRECTIONS, search.dir)
            ? search.dir
            : undefined,
    };
}
