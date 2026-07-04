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
    title,
}: {
    active: boolean;
    children: ReactNode;
    onClick: () => void;
    size?: "month" | "year";
    title?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            className={[
                "rounded border transition-colors",
                size === "year"
                    ? "px-3.5 py-1 text-base"
                    : "px-2.5 py-0.5 text-sm",
                active
                    ? "border-theme-link bg-theme-bg-hover font-medium text-theme-link"
                    : "border-theme-border/70 text-theme-text-soft hover:bg-theme-bg-hover hover:text-theme-text-strong",
            ].join(" ")}
        >
            {children}
        </button>
    );
}

// Global period picker: one pill per year (= that whole year) and one pill
// per month with data, all always visible. Lives in each affected tab's
// filter row; the selection itself is app-global.
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
        <label className="inline-flex w-fit items-center gap-2 text-sm text-theme-text-soft">
            {label}
            <select
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="max-w-56 rounded border border-theme-border/70 bg-theme-bg px-2 py-1 text-theme-text-strong"
            >
                {options.map((option) => (
                    <option key={option} value={option}>
                        {option || "(blank)"}
                    </option>
                ))}
            </select>
        </label>
    );
}
