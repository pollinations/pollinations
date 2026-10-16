import {
    CheckIcon,
    ChevronIcon,
    Dropdown,
    DropdownItem,
    Input,
    SearchIcon,
} from "@pollinations/ui";
import type { FC, KeyboardEvent } from "react";
import { KEY_SORT_LABELS, KEY_SORTS, type KeySort } from "./key-filter-sort.ts";

function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (
        event.key !== "ArrowDown" &&
        event.key !== "ArrowUp" &&
        event.key !== "Home" &&
        event.key !== "End"
    ) {
        return;
    }

    const items = Array.from(
        event.currentTarget.querySelectorAll<HTMLElement>(
            '[role="menuitemradio"]',
        ),
    );
    if (items.length === 0) return;

    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    const nextIndex =
        event.key === "Home"
            ? 0
            : event.key === "End"
              ? items.length - 1
              : event.key === "ArrowDown"
                ? (currentIndex + 1) % items.length
                : (currentIndex - 1 + items.length) % items.length;

    event.preventDefault();
    items[nextIndex]?.focus();
}

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
        <Dropdown
            align="end"
            className="catalog-filter-menu w-48 p-1"
            trigger={(open) => (
                <button
                    type="button"
                    aria-label={`Sort keys by ${KEY_SORT_LABELS[sort]}`}
                    title={`Sort: ${KEY_SORT_LABELS[sort]}`}
                    className="polli-control flex min-h-10 items-center gap-2 rounded-lg border border-theme-border bg-theme-bg-pale px-3 text-sm font-medium text-theme-text-base"
                >
                    <span className="text-theme-text-muted">Sort:</span>
                    <span className="whitespace-nowrap">
                        {KEY_SORT_LABELS[sort]}
                    </span>
                    <ChevronIcon expanded={open} />
                </button>
            )}
        >
            {(close) => (
                <div
                    role="menu"
                    aria-label="Sort keys"
                    onKeyDown={handleMenuKeyDown}
                    className="flex flex-col"
                >
                    {KEY_SORTS.map((option) => (
                        <DropdownItem
                            key={option}
                            role="menuitemradio"
                            aria-checked={sort === option}
                            onClick={() => {
                                onSortChange(option);
                                close();
                            }}
                            className="catalog-filter-option"
                        >
                            {KEY_SORT_LABELS[option]}
                            <CheckIcon
                                aria-hidden="true"
                                className={`ml-auto h-3.5 w-3.5 shrink-0 ${sort === option ? "" : "invisible"}`}
                            />
                        </DropdownItem>
                    ))}
                </div>
            )}
        </Dropdown>
    </div>
);
