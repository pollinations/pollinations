import { MultiSelect, TabButton } from "@pollinations/ui";
import type { ReactNode } from "react";
import type { FacetOption } from "../lib/filterFacets";
import { monthName } from "../lib/months";

export function FilterBar({ children }: { children: ReactNode }) {
    return (
        <div className="flex w-full flex-col items-start gap-2">{children}</div>
    );
}

export function YearFilter({
    onChange,
    value,
    years,
}: {
    onChange: (value: string) => void;
    value: string;
    years: string[];
}) {
    if (years.length === 0) return null;

    return (
        <fieldset
            className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-theme-text-soft"
            aria-label="year filter"
        >
            {years.map((year) => (
                <TabButton
                    key={year}
                    active={value === year}
                    onClick={() => onChange(year)}
                    size="md"
                    variant="soft"
                >
                    {year}
                </TabButton>
            ))}
        </fieldset>
    );
}

export function MonthIssueCount({ count }: { count: number }) {
    if (count === 0) return null;
    return (
        <span
            className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-amber-300 px-1.5 text-xs font-semibold leading-5 text-amber-950"
            title={`${count} unresolved reconciliation items`}
        >
            {count}
            <span className="sr-only"> unresolved items</span>
        </span>
    );
}

export function MonthFilter({
    months,
    onChange,
    value,
    year,
}: {
    months: string[];
    onChange: (value: string) => void;
    value: string;
    year: string;
}) {
    const visibleMonths = months.filter((month) => month.startsWith(year));
    if (visibleMonths.length === 0) return null;

    return (
        <fieldset
            className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-theme-text-soft"
            aria-label="month filter"
        >
            {visibleMonths.map((month) => (
                <TabButton
                    key={month}
                    active={value === month}
                    onClick={() => onChange(month)}
                    size="sm"
                    variant="soft"
                >
                    {monthName(month)}
                </TabButton>
            ))}
        </fieldset>
    );
}

export function FilterMultiSelect({
    onChange,
    options,
    placeholder,
    value,
}: {
    onChange: (value: string[]) => void;
    options: FacetOption[];
    placeholder: string;
    value: string[];
}) {
    return (
        <MultiSelect
            placeholder={placeholder}
            selected={value}
            onChange={onChange}
            options={options.map((option) => ({
                value: option.value,
                label: `${option.label || "(blank)"}${
                    option.count == null ? "" : ` · ${option.count}`
                }`,
            }))}
        />
    );
}
