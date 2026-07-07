import {
    Button,
    ChevronIcon,
    Dropdown,
    DropdownItem,
    TabButton,
} from "@pollinations/ui";
import type { ReactNode } from "react";
import { monthLabel, yearsOf } from "../lib/months";

// One filter language for every tab: pill buttons for months, a labeled
// select for enums, a switch for boolean views.

export function FilterBar({ children }: { children: ReactNode }) {
    return <div className="flex flex-col items-start gap-2">{children}</div>;
}

function Pill({
    active,
    children,
    onClick,
    size = "month",
}: {
    active: boolean;
    children: ReactNode;
    onClick: () => void;
    size?: "month" | "year";
}) {
    return (
        <TabButton
            active={active}
            onClick={onClick}
            size={size === "year" ? "md" : "sm"}
            variant="ghost"
        >
            {children}
        </TabButton>
    );
}

export function MonthFilter({
    months,
    onChange,
    value,
}: {
    months: string[];
    onChange: (value: string) => void;
    value: string;
}) {
    if (months.length === 0) return null;
    return (
        <fieldset
            className="flex flex-wrap items-center gap-1.5 text-sm text-theme-text-soft"
            aria-label="month filter"
        >
            <span className="mr-0.5">period</span>
            {yearsOf(months).map((year) => (
                <span
                    key={year}
                    className="inline-flex flex-wrap items-center gap-1.5"
                >
                    <Pill
                        active={value === year || value === ""}
                        onClick={() => onChange(year)}
                        size="year"
                    >
                        {year}
                    </Pill>
                    {months
                        .filter((month) => month.startsWith(year))
                        .map((month) => (
                            <Pill
                                key={month}
                                active={value === month}
                                onClick={() => onChange(month)}
                            >
                                {monthLabel(month)}
                            </Pill>
                        ))}
                </span>
            ))}
        </fieldset>
    );
}

export function FilterSelect({
    label,
    onChange,
    options,
    value,
}: {
    label: string;
    onChange: (value: string) => void;
    options: string[];
    value: string;
}) {
    return (
        <div className="inline-flex w-fit items-center gap-2 text-sm text-theme-text-soft">
            <span>{label}</span>
            <Dropdown
                trigger={(open) => (
                    <Button className="max-w-56 gap-2">
                        <span className="truncate">{value || "(blank)"}</span>
                        <ChevronIcon expanded={open} />
                    </Button>
                )}
            >
                {(close) => (
                    <div className="max-h-72 w-56 overflow-y-auto p-1">
                        {options.map((option) => (
                            <DropdownItem
                                key={option}
                                onClick={() => {
                                    onChange(option);
                                    close();
                                }}
                            >
                                {option || "(blank)"}
                            </DropdownItem>
                        ))}
                    </div>
                )}
            </Dropdown>
        </div>
    );
}
