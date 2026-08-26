import { MultiSelect, TabButton } from "@pollinations/ui";
import type { ReactNode } from "react";
import { monthLabel, yearsOf } from "../lib/months";

// Date uses visible month tabs; other filters use dropdown multi-selects.
// Empty selection means "all".

export function FilterBar({ children }: { children: ReactNode }) {
    return (
        <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2">
            {children}
        </div>
    );
}

export function MonthFilter({
    months,
    onChange,
    value,
}: {
    months: string[];
    onChange: (value: string[]) => void;
    value: string[];
}) {
    if (months.length === 0) return null;

    const toggleMonth = (month: string) => {
        const next = value.includes(month)
            ? value.filter((item) => item !== month)
            : [...value, month];
        onChange(months.filter((item) => next.includes(item)));
    };

    return (
        <fieldset
            className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-theme-text-soft"
            aria-label="date filter"
        >
            <span className="mr-1 font-medium">date</span>
            {yearsOf(months).map((year) => (
                <span
                    key={year}
                    className="inline-flex flex-wrap items-center gap-1.5"
                >
                    <TabButton
                        active={value.length === 0}
                        onClick={() => onChange([])}
                        size="md"
                        variant="soft"
                    >
                        {year}
                    </TabButton>
                    {months
                        .filter((month) => month.startsWith(year))
                        .map((month) => (
                            <TabButton
                                key={month}
                                active={value.includes(month)}
                                onClick={() => toggleMonth(month)}
                                size="sm"
                                variant="soft"
                            >
                                {monthLabel(month)}
                            </TabButton>
                        ))}
                </span>
            ))}
        </fieldset>
    );
}

export function FilterMultiSelect({
    label,
    onChange,
    options,
    placeholder,
    value,
}: {
    label: string;
    onChange: (value: string[]) => void;
    options: string[];
    placeholder: string;
    value: string[];
}) {
    return (
        <MultiSelect
            label={label}
            placeholder={placeholder}
            selected={value}
            onChange={onChange}
            options={options.map((option) => ({
                value: option,
                label: option || "(blank)",
            }))}
        />
    );
}
