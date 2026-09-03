/**
 * Search-param contract for /apps.
 *
 * Category and platform are independent multi-select filters. Ranking is a
 * separate single-select choice: it changes order without hiding apps.
 *
 * Same shape as enter's `model-search.ts` (PR #12458): `as const` whitelists,
 * a typed guard, and empty selections elided so a default view has a clean
 * URL. Lists round-trip as comma-separated values.
 */

/** Mirrors the category field in operations/app-management/app.json. */
export const APP_CATEGORIES = [
    "image",
    "chat",
    "build",
    "writing",
    "games",
    "learn",
    "business",
    "bots",
    "video_audio",
] as const;
type AppCategory = (typeof APP_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<AppCategory, string> = {
    image: "Image",
    chat: "Chat",
    build: "Build",
    writing: "Writing",
    games: "Games",
    learn: "Learn",
    business: "Business",
    bots: "Bots",
    video_audio: "Video & audio",
};

/** Mirrors the Platform column; an app can list several. */
export const APP_PLATFORMS = [
    "web",
    "android",
    "ios",
    "windows",
    "macos",
    "desktop",
    "cli",
    "discord",
    "telegram",
    "whatsapp",
    "library",
    "browser-ext",
    "roblox",
    "wordpress",
    "api",
] as const;
type AppPlatform = (typeof APP_PLATFORMS)[number];

export const PLATFORM_LABELS: Record<AppPlatform, string> = {
    web: "Web",
    android: "Android",
    ios: "iOS",
    windows: "Windows",
    macos: "macOS",
    desktop: "Desktop",
    cli: "CLI",
    discord: "Discord",
    telegram: "Telegram",
    whatsapp: "WhatsApp",
    library: "Library",
    "browser-ext": "Browser extension",
    roblox: "Roblox",
    wordpress: "WordPress",
    api: "API",
};

export const APP_SORTS = ["fresh", "buzz", "pollen"] as const;
export type AppSort = (typeof APP_SORTS)[number];

/**
 * Axes are stored comma-joined, not as arrays. TanStack serialises an array
 * as JSON, which turns ?category=games,build into
 * ?category=%5B%22games%22%2C%22build%22%5D — unreadable, and impossible to
 * edit by hand or paste into a doc.
 */
export type AppSearch = {
    category?: string;
    platform?: string;
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
    // Deduplicate so ?category=games,games doesn't double-count.
    const unique = [...new Set(valid)];
    return unique.length > 0 ? unique.join(",") : undefined;
}

/** Read one axis back as a typed list. */
export function listOf<T extends string>(
    values: readonly T[],
    raw: string | undefined,
): T[] {
    if (!raw) return [];
    return raw
        .split(",")
        .filter((item): item is T => values.includes(item as T));
}

export function validateAppSearch(search: Record<string, unknown>): AppSearch {
    const q = typeof search.q === "string" ? search.q.trim() : "";
    const requestedSort =
        typeof search.sort === "string" &&
        APP_SORTS.includes(search.sort as AppSort)
            ? (search.sort as AppSort)
            : "fresh";
    return {
        category: cleanList(APP_CATEGORIES, search.category),
        platform: cleanList(APP_PLATFORMS, search.platform),
        // Fresh is the default, so keep the default URL clean.
        sort: requestedSort === "fresh" ? undefined : requestedSort,
        q: q === "" ? undefined : q,
    };
}

/** Add or remove one value, returning undefined when the axis empties. */
export function toggle(current: string | undefined, value: string) {
    const set = new Set(current ? current.split(",") : []);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    return set.size > 0 ? [...set].join(",") : undefined;
}
