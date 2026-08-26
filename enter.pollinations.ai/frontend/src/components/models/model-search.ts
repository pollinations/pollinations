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
] as const;

export type ModelCategory = (typeof MODEL_CATEGORIES)[number];

export const MODEL_SCOPES = ["pollinations", "community"] as const;
export type ModelScope = (typeof MODEL_SCOPES)[number];

export const MODEL_SORTS = [
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

import { getModelCapabilities, getModelDisplayName } from "./model-info.ts";
import type { ModelPrice } from "./types.ts";

export const MODEL_SEARCH_FILTER_KEYS = [
    "access",
    "owner",
    "id",
    "type",
    "capability",
] as const;

export type ModelSearchFilterKey = (typeof MODEL_SEARCH_FILTER_KEYS)[number];

export type ParsedModelSearch = {
    freeText: string[];
    filters: Partial<Record<ModelSearchFilterKey, string[]>>;
};

export function parseModelSearchQuery(query: string): ParsedModelSearch {
    const tokens = query.trim().split(/\s+/).filter(Boolean);
    const freeText: string[] = [];
    const filters: Partial<Record<ModelSearchFilterKey, string[]>> = {};

    for (const token of tokens) {
        const colon = token.indexOf(":");
        if (colon > 0) {
            const key = token
                .slice(0, colon)
                .toLowerCase() as ModelSearchFilterKey;
            const value = token.slice(colon + 1).toLowerCase();
            if (
                value &&
                (MODEL_SEARCH_FILTER_KEYS as readonly string[]).includes(key)
            ) {
                (filters[key] ??= []).push(value);
                continue;
            }
        }
        freeText.push(token.toLowerCase());
    }

    return { freeText, filters };
}

export function matchesModelPrice(model: ModelPrice, query: string): boolean {
    if (!query.trim()) return true;

    const { freeText, filters } = parseModelSearchQuery(query);

    if (filters.access?.length) {
        const modelAccess = model.free
            ? "free"
            : model.paidOnly
              ? "paid"
              : "quest";
        if (!filters.access.includes(modelAccess)) return false;
    }

    if (filters.owner?.length) {
        const owner = (model.ownerLogin ?? "").toLowerCase();
        if (!owner || !filters.owner.some((v) => owner === v)) return false;
    }

    if (filters.id?.length) {
        const id = model.name.toLowerCase();
        if (!filters.id.some((v) => id === v || id.includes(v))) return false;
    }

    if (filters.type?.length) {
        if (!filters.type.includes(model.type)) return false;
    }

    if (filters.capability?.length) {
        const caps = getModelCapabilities(model).map((c) => c.toLowerCase());
        const rawCaps = model.capabilities.map((c) => c.toLowerCase());
        const allCaps = new Set([...caps, ...rawCaps]);
        if (!filters.capability.some((v) => allCaps.has(v))) return false;
    }

    if (freeText.length === 0) return true;

    const haystack = [
        model.name,
        getModelDisplayName(model) ?? "",
        model.description ?? "",
        model.brand ?? "",
        model.baseModel ?? "",
        model.ownerLogin ?? "",
        model.type,
        ...(model.inputModalities ?? []),
        ...(model.outputModalities ?? []),
        ...getModelCapabilities(model),
        ...model.capabilities,
    ]
        .join(" ")
        .toLowerCase();

    return freeText.every((term) => haystack.includes(term));
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
    const sort = includes(MODEL_SORTS, search.sort) ? search.sort : "newest";
    const query = typeof search.q === "string" ? search.q.trim() : "";

    return {
        scope: scope === "community" ? scope : undefined,
        category:
            category !== "all" &&
            (scope === "community"
                ? category === "text" ||
                  category === "image" ||
                  category === "agent"
                : category !== "agent")
                ? category
                : undefined,
        q: query || undefined,
        sort: sort === "newest" ? undefined : sort,
    };
}
