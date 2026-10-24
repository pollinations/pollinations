/**
 * Search-param contract for /apps.
 *
 * Category is a single-select filter, platform a multi-select one and Pollen
 * Pay a boolean. Ranking is a separate single-select choice: it changes order
 * without hiding apps.
 *
 * Same shape as enter's `model-search.ts` (PR #12458): `as const` whitelists,
 * a typed guard, and empty selections elided so a default view has a clean
 * URL. Lists round-trip as comma-separated values.
 */

import {
    APP_CATEGORIES,
    APP_PLATFORMS,
    type AppCategory,
} from "../../../shared/app-catalog.ts";

export {
    APP_CATEGORIES,
    APP_PLATFORMS,
    type AppCategory,
    type AppPlatform,
    CATEGORY_LABELS,
    PLATFORM_LABELS,
} from "../../../shared/app-catalog.ts";

export const APP_SORTS = ["fresh", "buzz"] as const;
export type AppSort = (typeof APP_SORTS)[number];

/**
 * Platforms are stored comma-joined, not as arrays. TanStack serialises an
 * array as JSON, producing unreadable URLs that are difficult to edit or share.
 */
export type AppSearch = {
    category?: AppCategory;
    platform?: string;
    pollen?: boolean;
    sort?: AppSort;
    q?: string;
};

function cleanList<T extends string>(
    values: readonly T[],
    raw: unknown,
): string | undefined {
    const items =
        typeof raw === "string"
            ? raw.split(",")
            : Array.isArray(raw)
              ? raw.map(String)
              : [];
    const valid = items
        .map((item) => item.trim())
        .filter((item): item is T => values.includes(item as T));
    // Deduplicate so ?platform=web,web doesn't double-count.
    const unique = [...new Set(valid)];
    return unique.length > 0 ? unique.join(",") : undefined;
}

function cleanValue<T extends string>(
    values: readonly T[],
    raw: unknown,
): T | undefined {
    if (typeof raw !== "string") return undefined;
    const value = raw.trim();
    return values.includes(value as T) ? (value as T) : undefined;
}

export function validateAppSearch(search: Record<string, unknown>): AppSearch {
    // The URL also controls the input; preserve whitespace while typing.
    const q = typeof search.q === "string" ? search.q : "";
    const pollen =
        search.pollen === true || search.pollen === "true"
            ? true
            : search.pollen === false || search.pollen === "false"
              ? false
              : undefined;
    const sort = cleanValue(APP_SORTS, search.sort);
    return {
        category: cleanValue(APP_CATEGORIES, search.category),
        platform: cleanList(APP_PLATFORMS, search.platform),
        pollen,
        // Fresh is the default, so keep the default URL clean.
        sort: sort === "fresh" ? undefined : sort,
        q: q === "" ? undefined : q,
    };
}
