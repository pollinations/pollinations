import {
    AccountIcon,
    Button,
    ChevronIcon,
    ClockIcon,
    Dropdown,
    DropdownItem,
    Tooltip,
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
        accessibleLabel: "Date added, newest first",
    },
    {
        value: "price-low",
        accessibleLabel: "Lowest price first",
    },
    {
        value: "price-high",
        accessibleLabel: "Highest price first",
    },
    { value: "title", accessibleLabel: "Name: A to Z" },
    {
        value: "title-desc",
        accessibleLabel: "Name: Z to A",
    },
    {
        value: "publisher",
        accessibleLabel: "Publisher: A to Z",
    },
    {
        value: "publisher-desc",
        accessibleLabel: "Publisher: Z to A",
    },
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
            ?.accessibleLabel ?? "Most popular";
    return (
        <Dropdown
            align="end"
            className="w-20 p-1"
            trigger={(open) => (
                <Button
                    type="button"
                    size="md"
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
                    className="flex flex-col gap-1"
                >
                    {SORT_OPTIONS.map((option) => (
                        <Tooltip
                            key={option.value}
                            content={option.accessibleLabel}
                            triggerAs="span"
                            displayContents
                            stopClickPropagation={false}
                            className="w-full"
                        >
                            <DropdownItem
                                role="menuitemradio"
                                aria-label={option.accessibleLabel}
                                aria-checked={value === option.value}
                                onClick={() => {
                                    onChange(option.value);
                                    close();
                                }}
                                className={
                                    value === option.value
                                        ? "min-h-9 justify-center px-2 bg-theme-bg-active text-theme-text-strong"
                                        : "min-h-9 justify-center px-2"
                                }
                            >
                                <ModelSortIcon sort={option.value} />
                            </DropdownItem>
                        </Tooltip>
                    ))}
                </div>
            )}
        </Dropdown>
    );
}
