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

export const MODEL_SCOPES = ["pollinations", "community"] as const;
export type ModelScope = (typeof MODEL_SCOPES)[number];

export const MODEL_SORTS = [
    "popular",
    "newest",
    "oldest",
    "price-low",
    "price-high",
    "title",
    "title-desc",
    "brand",
    "brand-desc",
] as const;
export type ModelSort = (typeof MODEL_SORTS)[number];

export type ModelSearch = {
    scope?: ModelScope;
    category?: ModelCategory;
    q?: string;
    sort?: ModelSort;
};

type ModelSectionInput = {
    type: Exclude<ModelCategory, "all" | "agent">;
    agent?: boolean;
};

const MODEL_SECTION_ORDER: ModelCategory[] = [
    "all",
    "text",
    "image",
    "video",
    "3d",
    "audio",
    "realtime",
    "embedding",
    "agent",
];

/** Model tabs in display order, limited to categories present in the catalog. */
export function getAvailableModelSections(
    models: readonly ModelSectionInput[],
): ModelCategory[] {
    const present = new Set(
        models.map((model) => (model.agent ? "agent" : model.type)),
    );
    return MODEL_SECTION_ORDER.filter(
        (category) => category === "all" || present.has(category),
    );
}

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
    const sort = includes(MODEL_SORTS, search.sort) ? search.sort : "popular";
    const query = typeof search.q === "string" ? search.q.trim() : "";

    return {
        scope: scope === "community" ? scope : undefined,
        category:
            category !== "all" &&
            (scope === "community" || category !== "agent")
                ? category
                : undefined,
        q: query || undefined,
        sort: sort === "popular" ? undefined : sort,
    };
}
