/**
 * Search-param contract for /apps.
 *
 * Same shape as enter's `components/models/model-search.ts` (PR #12458):
 * an `as const` whitelist, a typed guard, and defaults mapped to `undefined`
 * so they never appear in the URL. Deliberately not shared with that file —
 * the vocabulary is entirely different and only the pattern transfers.
 */

/** Mirrors the Category column in apps/APPS.md. */
export const APP_CATEGORIES = [
    "all",
    "image",
    "video_audio",
    "writing",
    "chat",
    "games",
    "learn",
    "bots",
    "build",
    "business",
] as const;
export type AppCategory = (typeof APP_CATEGORIES)[number];

/**
 * Computed in .github/scripts/app-update-greenhouse.js — buzz is
 * requests24h >= 100, pollen is "uses BYOP", fresh is approved within 30 days.
 * None of them are editorial.
 */
export const APP_BADGES = ["all", "buzz", "pollen", "fresh"] as const;
export type AppBadge = (typeof APP_BADGES)[number];

export type AppSearch = {
    category?: AppCategory;
    badge?: AppBadge;
    q?: string;
};

function includes<T extends string>(
    values: readonly T[],
    value: unknown,
): value is T {
    return typeof value === "string" && values.includes(value as T);
}

export function validateAppSearch(search: Record<string, unknown>): AppSearch {
    const category = includes(APP_CATEGORIES, search.category)
        ? search.category
        : undefined;
    const badge = includes(APP_BADGES, search.badge) ? search.badge : undefined;
    const q = typeof search.q === "string" ? search.q.trim() : "";

    return {
        // "all" is the default view, so it stays out of the URL entirely.
        category: category === "all" ? undefined : category,
        badge: badge === "all" ? undefined : badge,
        q: q === "" ? undefined : q,
    };
}
