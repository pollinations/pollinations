import { MultiSelect, TabButton } from "@pollinations/ui";
import type { ReactNode } from "react";
import type { FacetOption } from "../lib/filterFacets";
import { completedMonthsInYear, monthLabel, yearsOf } from "../lib/months";

export type MonthFilterMode = "month" | "month-or-ytd";

function sameMonths(left: string[], right: string[]) {
    return (
        left.length === right.length &&
        left.every((month, index) => month === right[index])
    );
}

export function FilterBar({ children }: { children: ReactNode }) {
    return (
        <div className="flex w-full flex-col items-start gap-2">{children}</div>
    );
}

export function MonthFilter({
    months,
    mode = "month-or-ytd",
    now = new Date(),
    onChange,
    value,
}: {
    months: string[];
    mode?: MonthFilterMode;
    now?: Date;
    onChange: (value: string[]) => void;
    value: string[];
}) {
    if (months.length === 0) return null;
    const currentYear = String(now.getUTCFullYear());

    return (
        <fieldset
            className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-theme-text-soft"
            aria-label="date filter"
        >
            <span className="mr-1 font-medium">date</span>
            {yearsOf(months).map((year) => {
                const completedMonths = completedMonthsInYear(
                    months,
                    year,
                    now,
                );
                return (
                    <span
                        key={year}
                        className="inline-flex flex-wrap items-center gap-1.5"
                    >
                        {mode === "month-or-ytd" &&
                            completedMonths.length > 0 && (
                                <TabButton
                                    active={sameMonths(value, completedMonths)}
                                    onClick={() => onChange(completedMonths)}
                                    size="md"
                                    variant="soft"
                                >
                                    {year === currentYear ? "YTD" : year}
                                </TabButton>
                            )}
                        {months
                            .filter((month) => month.startsWith(year))
                            .map((month) => (
                                <TabButton
                                    key={month}
                                    active={
                                        value.length === 1 && value[0] === month
                                    }
                                    onClick={() => onChange([month])}
                                    size="sm"
                                    variant="soft"
                                >
                                    {monthLabel(month)}
                                </TabButton>
                            ))}
                    </span>
                );
            })}
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
    options: FacetOption[];
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
                value: option.value,
                label: `${option.label || "(blank)"}${
                    option.count == null ? "" : ` · ${option.count}`
                }`,
            }))}
        />
    );
}
