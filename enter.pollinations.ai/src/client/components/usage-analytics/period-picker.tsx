import type { FC } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/util.ts";
import { FilterButton } from "./filter-button.tsx";
import {
    addUtcDays,
    formatPeriodLabel,
    isUsagePeriodSelectable,
    periodFromDate,
    periodToWindow,
    startOfUtcDay,
    usageMinDate,
} from "./period-utils.ts";
import type { PeriodGranularity, UsagePeriodSelection } from "./types.ts";

type PeriodPickerProps = {
    value: UsagePeriodSelection;
    onChange: (value: UsagePeriodSelection) => void;
};

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_LABELS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
];

function addUtcMonths(date: Date, months: number): Date {
    return new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1),
    );
}

function monthGridDates(viewMonth: Date): Date[] {
    const firstDay = new Date(
        Date.UTC(viewMonth.getUTCFullYear(), viewMonth.getUTCMonth(), 1),
    );
    const firstWeekday = firstDay.getUTCDay() || 7;
    const cursor = addUtcDays(firstDay, 1 - firstWeekday);
    return Array.from({ length: 42 }, (_, index) => addUtcDays(cursor, index));
}

function sameUtcDay(left: Date, right: Date): boolean {
    return left.toISOString().slice(0, 10) === right.toISOString().slice(0, 10);
}

function periodDate(value: UsagePeriodSelection): Date {
    return periodToWindow(value).start;
}

export const PeriodPicker: FC<PeriodPickerProps> = ({ value, onChange }) => {
    const [open, setOpen] = useState(false);
    const [viewDate, setViewDate] = useState<Date>(() => periodDate(value));
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setViewDate(periodDate(value));
    }, [value]);

    useEffect(() => {
        const handleClick = (event: MouseEvent) => {
            if (!ref.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    const dates = useMemo(() => monthGridDates(viewDate), [viewDate]);
    const selectedWindow = periodToWindow(value);
    const today = startOfUtcDay();
    const minDate = usageMinDate();
    const previousViewDate =
        value.granularity === "month"
            ? addUtcMonths(viewDate, -12)
            : addUtcMonths(viewDate, -1);
    const nextViewDate =
        value.granularity === "month"
            ? addUtcMonths(viewDate, 12)
            : addUtcMonths(viewDate, 1);
    const previousDisabled =
        value.granularity === "month"
            ? previousViewDate.getUTCFullYear() < minDate.getUTCFullYear()
            : addUtcMonths(previousViewDate, 1) <= minDate;
    const nextDisabled =
        value.granularity === "month"
            ? nextViewDate.getUTCFullYear() > today.getUTCFullYear()
            : nextViewDate > today;

    const setGranularity = (granularity: PeriodGranularity) => {
        onChange(periodFromDate(granularity, periodDate(value)));
    };

    const selectDate = (date: Date) => {
        onChange(periodFromDate(value.granularity, date));
        setOpen(false);
    };

    const viewLabel =
        value.granularity === "month"
            ? String(viewDate.getUTCFullYear())
            : viewDate.toLocaleDateString("en-US", {
                  timeZone: "UTC",
                  month: "long",
                  year: "numeric",
              });

    return (
        <div ref={ref} className="relative flex flex-wrap items-center gap-2">
            <div className="flex gap-1.5">
                {(["day", "week", "month"] as PeriodGranularity[]).map(
                    (granularity) => (
                        <FilterButton
                            key={granularity}
                            active={value.granularity === granularity}
                            onClick={() => setGranularity(granularity)}
                        >
                            {granularity[0].toUpperCase() +
                                granularity.slice(1)}
                        </FilterButton>
                    ),
                )}
            </div>
            <button
                type="button"
                onClick={() => setOpen((isOpen) => !isOpen)}
                className={cn(
                    "inline-flex min-w-[150px] items-center justify-between gap-2 rounded-full border px-4 py-1.5 text-left text-xs font-medium",
                    "border-amber-950 bg-white text-amber-950 transition-all duration-200 ease-out hover:bg-amber-50",
                    open && "bg-amber-50 shadow-sm",
                )}
            >
                <span>{formatPeriodLabel(value)}</span>
                <svg
                    aria-hidden="true"
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    className={cn(
                        "shrink-0 transition-transform duration-200 ease-out",
                        open && "rotate-180",
                    )}
                >
                    <path
                        d="M3 4.5 6 7.5l3-3"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.5"
                    />
                </svg>
            </button>
            {open && (
                <div className="absolute left-0 top-full z-30 mt-2 w-[304px] rounded-xl border border-amber-950 bg-white p-3 shadow-lg transition-opacity duration-200 ease-out">
                    <div className="mb-3 flex items-center justify-between">
                        <button
                            type="button"
                            disabled={previousDisabled}
                            onClick={() => setViewDate(previousViewDate)}
                            className={cn(
                                "rounded-full px-2 py-1 text-xs font-semibold text-amber-950 transition-colors hover:bg-amber-50",
                                previousDisabled &&
                                    "cursor-not-allowed opacity-30 hover:bg-transparent",
                            )}
                        >
                            {"<"}
                        </button>
                        <div className="text-sm font-bold text-amber-950">
                            {viewLabel}
                        </div>
                        <button
                            type="button"
                            disabled={nextDisabled}
                            onClick={() => setViewDate(nextViewDate)}
                            className={cn(
                                "rounded-full px-2 py-1 text-xs font-semibold text-amber-950 transition-colors hover:bg-amber-50",
                                nextDisabled &&
                                    "cursor-not-allowed opacity-30 hover:bg-transparent",
                            )}
                        >
                            {">"}
                        </button>
                    </div>

                    {value.granularity === "month" ? (
                        <div className="grid grid-cols-3 gap-1.5">
                            {MONTH_LABELS.map((label, monthIndex) => {
                                const date = new Date(
                                    Date.UTC(
                                        viewDate.getUTCFullYear(),
                                        monthIndex,
                                        1,
                                    ),
                                );
                                const selectable = isUsagePeriodSelectable(
                                    periodFromDate("month", date),
                                );
                                const selected =
                                    date.getUTCFullYear() ===
                                        selectedWindow.start.getUTCFullYear() &&
                                    date.getUTCMonth() ===
                                        selectedWindow.start.getUTCMonth();
                                return (
                                    <button
                                        type="button"
                                        key={label}
                                        disabled={!selectable}
                                        onClick={() => selectDate(date)}
                                        className={cn(
                                            "rounded-md px-3 py-2 text-xs font-medium transition-colors duration-150",
                                            selected
                                                ? "bg-amber-950 text-amber-100"
                                                : "text-gray-700 hover:bg-amber-50",
                                            !selectable &&
                                                "cursor-not-allowed text-gray-300 hover:bg-transparent",
                                        )}
                                    >
                                        {label}
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <>
                            <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase text-gray-400">
                                {WEEKDAY_LABELS.map((label) => (
                                    <div key={label}>{label}</div>
                                ))}
                            </div>
                            <div className="grid grid-cols-7 gap-1">
                                {dates.map((date) => {
                                    const inCurrentMonth =
                                        date.getUTCMonth() ===
                                        viewDate.getUTCMonth();
                                    const selectable = isUsagePeriodSelectable(
                                        periodFromDate(value.granularity, date),
                                    );
                                    const selected =
                                        value.granularity === "day"
                                            ? sameUtcDay(
                                                  date,
                                                  selectedWindow.start,
                                              )
                                            : date >= selectedWindow.start &&
                                              date < selectedWindow.end;
                                    return (
                                        <button
                                            type="button"
                                            key={date.toISOString()}
                                            disabled={!selectable}
                                            onClick={() => selectDate(date)}
                                            className={cn(
                                                "aspect-square rounded-md text-xs font-medium transition-colors duration-150",
                                                !inCurrentMonth &&
                                                    "text-gray-300",
                                                sameUtcDay(date, today) &&
                                                    "ring-1 ring-amber-950/40",
                                                selected
                                                    ? "bg-amber-950 text-amber-100"
                                                    : "text-gray-700 hover:bg-amber-50",
                                                !selectable &&
                                                    "cursor-not-allowed text-gray-300 hover:bg-transparent",
                                            )}
                                        >
                                            {date.getUTCDate()}
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};
