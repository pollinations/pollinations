export const MODEL_CATEGORIES = [
    "all",
    "image",
    "video",
    "3d",
    "audio",
    "realtime",
    "text",
    "embedding",
] as const;

export type ModelCategory = (typeof MODEL_CATEGORIES)[number];

export const MODEL_SCOPES = ["pollinations", "community"] as const;
export type ModelScope = (typeof MODEL_SCOPES)[number];

export type ModelSearch = {
    scope?: ModelScope;
    category?: ModelCategory;
    q?: string;
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
    const scope = includes(MODEL_SCOPES, search.scope)
        ? search.scope
        : "pollinations";
    const category = includes(MODEL_CATEGORIES, search.category)
        ? search.category
        : "all";

    return {
        scope: scope === "community" ? scope : undefined,
        category:
            category !== "all" &&
            (scope !== "community" ||
                category === "text" ||
                category === "image")
                ? category
                : undefined,
        q:
            typeof search.q === "string" && search.q.length > 0
                ? search.q
                : undefined,
    };
}
