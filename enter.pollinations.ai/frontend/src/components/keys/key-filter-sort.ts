import type { ApiKey } from "./types.ts";

export const KEY_SORTS = [
    "recently-used",
    "spend",
    "budget",
    "created",
    "name",
] as const;
export type KeySort = (typeof KEY_SORTS)[number];

export const KEY_SORT_LABELS: Record<KeySort, string> = {
    "recently-used": "Recently used",
    spend: "Total spend",
    budget: "Budget left",
    created: "Date created",
    name: "Name",
};

export function isKeySort(value: unknown): value is KeySort {
    return typeof value === "string" && KEY_SORTS.includes(value as KeySort);
}

/** Timestamp of last use, 0 when the key has never been used. */
function lastUsedAt(apiKey: ApiKey): number {
    return apiKey.lastRequest ? new Date(apiKey.lastRequest).getTime() : 0;
}

/** Remaining budget; an absent budget means no cap, so treat it as largest. */
function budgetLeft(apiKey: ApiKey): number {
    const budget = apiKey.pollenBalance;
    return budget == null ? Number.POSITIVE_INFINITY : budget;
}

// Keys that have not been used sink below used keys on both directions, so a
// "recently used" list stays useful instead of sorting never-used keys first.
const compareUsed = (a: ApiKey, b: ApiKey, direction: "asc" | "desc") => {
    const delta = lastUsedAt(a) - lastUsedAt(b);
    return direction === "asc" ? delta : -delta;
};

export function sortKeys(keys: ApiKey[], sort: KeySort): ApiKey[] {
    return [...keys].sort((a, b) => {
        switch (sort) {
            case "spend":
                return (b.totalSpend ?? 0) - (a.totalSpend ?? 0);
            case "budget":
                return budgetLeft(a) - budgetLeft(b);
            case "created":
                return (
                    new Date(b.createdAt).getTime() -
                    new Date(a.createdAt).getTime()
                );
            case "name":
                return (a.name ?? "").localeCompare(b.name ?? "", undefined, {
                    sensitivity: "base",
                });
            case "recently-used":
                return compareUsed(a, b, "desc");
            default:
                return 0;
        }
    });
}

export function filterKeys(keys: ApiKey[], query: string): ApiKey[] {
    const needle = query.trim().toLowerCase();
    if (!needle) return keys;
    return keys.filter((apiKey) =>
        [apiKey.name, apiKey.start, apiKey.byopClientKeyId]
            .filter((value): value is string => typeof value === "string")
            .some((value) => value.toLowerCase().includes(needle)),
    );
}
