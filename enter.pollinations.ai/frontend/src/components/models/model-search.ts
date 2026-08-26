import type { ModelPrice } from "./types.ts";

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

/** Parses a raw search string into structured filters and free-text terms. */
export type ParsedQuery = {
    filters: Record<string, string>;
    terms: string[];
};

/**
 * Parse a search query string into `key:value` filters and free-text terms.
 * Tokens containing a colon (before the first character of the colon) are
 * treated as filters; everything else is a free-text term.
 */
export function parseQuery(query: string): ParsedQuery {
    const filters: Record<string, string> = {};
    const terms: string[] = [];
    for (const token of query.trim().split(/\s+/)) {
        const colonIndex = token.indexOf(":");
        if (colonIndex > 0) {
            const key = token.slice(0, colonIndex).toLowerCase();
            const value = token.slice(colonIndex + 1);
            if (value) filters[key] = value;
            else terms.push(token.toLowerCase());
        } else if (token) {
            terms.push(token.toLowerCase());
        }
    }
    return { filters, terms };
}

const COMMUNITY_OWNER_RE = /^([^/]+)\//;

/** Extract the GitHub owner login from a community model's name (`<owner>/<name>`). */
export function getOwnerLogin(model: ModelPrice): string | undefined {
    if (!model.community) return undefined;
    const match = model.name.match(COMMUNITY_OWNER_RE);
    return match ? match[1] : undefined;
}

/** Determine the access tier label for a model, used by the `access:` filter. */
function getAccessLabel(model: ModelPrice): "paid" | "quest" | "free" {
    if (model.free) return "free";
    if (model.paidOnly) return "paid";
    return "quest";
}

/**
 * Check whether a model matches the parsed search query.
 * Applies `key:value` filters first (AND logic with early exit), then free-text
 * terms across name, displayName, description, brand, baseModel, modalities,
 * and capabilities (also AND logic — all terms must match).
 */
export function matchesQuery(model: ModelPrice, query: string): boolean {
    if (!query.trim()) return true;
    const { filters, terms } = parseQuery(query);

    for (const [key, value] of Object.entries(filters)) {
        const lowerValue = value.toLowerCase();
        switch (key) {
            case "access":
                if (getAccessLabel(model) !== lowerValue) return false;
                break;
            case "owner":
                if (getOwnerLogin(model)?.toLowerCase() !== lowerValue)
                    return false;
                break;
            case "id":
                if (model.name.toLowerCase() !== lowerValue) return false;
                break;
            case "type":
                if (model.type.toLowerCase() !== lowerValue) return false;
                break;
            case "capability":
                if (
                    !model.capabilities.some(
                        (c) => c.toLowerCase() === lowerValue,
                    )
                )
                    return false;
                break;
            default:
                break;
        }
    }

    if (terms.length > 0) {
        const displayName = model.displayName ?? "";
        const haystack = [
            model.name,
            displayName,
            model.description ?? "",
            model.brand ?? "",
            model.baseModel ?? "",
            ...(model.inputModalities ?? []),
            ...(model.outputModalities ?? []),
            ...(model.capabilities ?? []),
        ]
            .join(" ")
            .toLowerCase();

        for (const term of terms) {
            if (!haystack.includes(term)) return false;
        }
    }

    return true;
}
