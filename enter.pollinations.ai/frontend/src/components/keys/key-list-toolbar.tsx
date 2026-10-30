import { Input, SearchIcon } from "@pollinations/ui";
import type { FC } from "react";
import { KEY_SORT_LABELS, KEY_SORTS, type KeySort } from "./key-filter-sort.ts";

const SORT_SELECT_CLASS =
    "polli-control min-h-10 rounded-lg border border-theme-border bg-theme-bg-pale px-3 text-sm font-medium text-theme-text-base";

export const KeyListToolbar: FC<{
    query: string;
    onQueryChange: (query: string) => void;
    sort: KeySort;
    onSortChange: (sort: KeySort) => void;
}> = ({ query, onQueryChange, sort, onSortChange }) => (
    <div className="flex flex-wrap items-center gap-2">
        <div className="catalog-search relative min-w-56 flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-theme-text-muted" />
            <Input
                value={query}
                placeholder="Search keys…"
                aria-label="Search keys"
                autoComplete="off"
                className="w-full pl-9"
                onChange={(event) => onQueryChange(event.currentTarget.value)}
            />
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-theme-text-muted">
            Sort
            <select
                value={sort}
                onChange={(event) =>
                    onSortChange(event.currentTarget.value as KeySort)
                }
                className={SORT_SELECT_CLASS}
            >
                {KEY_SORTS.map((option) => (
                    <option key={option} value={option}>
                        {KEY_SORT_LABELS[option]}
                    </option>
                ))}
            </select>
        </label>
    </div>
);
