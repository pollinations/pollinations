import {
    AccountIcon,
    Button,
    CheckIcon,
    ChevronIcon,
    ClockIcon,
    Dropdown,
    DropdownItem,
    TrendUpIcon,
} from "@pollinations/ui";
import type { KeyboardEvent } from "react";
import type { ModelSort } from "./model-search.ts";

const SORT_OPTIONS: Array<{
    value: ModelSort;
    accessibleLabel: string;
}> = [
    {
        value: "popular",
        accessibleLabel: "Most popular",
    },
    {
        value: "newest",
        accessibleLabel: "Newest",
    },
    {
        value: "price-low",
        accessibleLabel: "Price: low to high",
    },
    {
        value: "price-high",
        accessibleLabel: "Price: high to low",
    },
    { value: "title", accessibleLabel: "Name: A–Z" },
];

function ModelSortIcon({ sort }: { sort: ModelSort }) {
    return (
        <span
            aria-hidden="true"
            className="inline-flex w-11 items-center justify-center gap-1"
        >
            {sort === "popular" ? (
                <TrendUpIcon className="h-5 w-5" />
            ) : sort === "newest" ? (
                <ClockIcon className="h-5 w-5" />
            ) : sort === "price-low" || sort === "price-high" ? (
                <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                >
                    <path
                        d={
                            sort === "price-low"
                                ? "M5 20v-5M12 20V10M19 20V4"
                                : "M5 20V4M12 20V10M19 20v-5"
                        }
                    />
                </svg>
            ) : (
                <>
                    {sort.startsWith("publisher") && (
                        <AccountIcon className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className="text-xs font-medium whitespace-nowrap">
                        {sort.endsWith("-desc") ? "Z–A" : "A–Z"}
                    </span>
                </>
            )}
        </span>
    );
}

function handleSortMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
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

export function ModelSortMenu({
    value,
    onChange,
}: {
    value: ModelSort;
    onChange: (sort: ModelSort) => void;
}) {
    const selectedLabel =
        SORT_OPTIONS.find((option) => option.value === value)
            ?.accessibleLabel ?? value.replaceAll("-", " ");
    return (
        <Dropdown
            align="end"
            className="catalog-filter-menu w-48 p-1"
            trigger={(open) => (
                <Button
                    type="button"
                    size="md"
                    intent="neutral"
                    aria-label={`Sort models by ${selectedLabel}`}
                    title={`Sort: ${selectedLabel}`}
                    className="w-20 shrink-0 justify-center gap-1 px-2"
                >
                    <ModelSortIcon sort={value} />
                    <ChevronIcon expanded={open} />
                </Button>
            )}
        >
            {(close) => (
                <div
                    role="menu"
                    aria-label="Sort models"
                    onKeyDown={handleSortMenuKeyDown}
                    className="flex flex-col"
                >
                    {SORT_OPTIONS.map((option) => (
                        <DropdownItem
                            key={option.value}
                            type="button"
                            role="menuitemradio"
                            aria-checked={value === option.value}
                            onClick={() => {
                                onChange(option.value);
                                close();
                            }}
                            className="catalog-filter-option"
                        >
                            {option.accessibleLabel}
                            <CheckIcon
                                aria-hidden="true"
                                className={`ml-auto h-3.5 w-3.5 shrink-0 ${value === option.value ? "" : "invisible"}`}
                            />
                        </DropdownItem>
                    ))}
                </div>
            )}
        </Dropdown>
    );
}
