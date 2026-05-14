import type { FC } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/util.ts";
import type { ThemeName } from "../layout/dashboard-theme.ts";
import { TabButton } from "../ui/tab-button.tsx";
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
    theme: ThemeName;
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
    return left.getTime() === right.getTime();
}

function periodDate(value: UsagePeriodSelection): Date {
    return periodToWindow(value).start;
}

function viewBounds(
    viewDate: Date,
    granularity: PeriodGranularity,
): { start: Date; end: Date } {
    if (granularity === "month") {
        const start = new Date(Date.UTC(viewDate.getUTCFullYear(), 0, 1));
        return { start, end: addUtcMonths(start, 12) };
    }

    const start = new Date(
        Date.UTC(viewDate.getUTCFullYear(), viewDate.getUTCMonth(), 1),
    );
    return { start, end: addUtcMonths(start, 1) };
}

export const PeriodPicker: FC<PeriodPickerProps> = ({
    value,
    onChange,
    theme,
}) => {
    const [open, setOpen] = useState(false);
    const [viewDate, setViewDate] = useState<Date>(() => periodDate(value));
    const ref = useRef<HTMLDivElement>(null);
    const { granularity, period } = value;

    useEffect(() => {
        setViewDate(periodDate({ granularity, period }));
    }, [granularity, period]);

    useEffect(() => {
        const handleClick = (event: MouseEvent) => {
            if (!ref.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    useEffect(() => {
        if (!open) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setOpen(false);
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [open]);

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
    const previousBounds = viewBounds(previousViewDate, value.granularity);
    const nextBounds = viewBounds(nextViewDate, value.granularity);
    const previousDisabled = previousBounds.end <= minDate;
    const nextDisabled = nextBounds.start > today;

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
        <div
            ref={ref}
            data-theme={theme}
            className="relative flex flex-wrap items-center gap-2"
        >
            <div className="flex flex-wrap gap-1.5">
                {(["day", "week", "month"] as PeriodGranularity[]).map(
                    (granularity) => (
                        <TabButton
                            key={granularity}
                            active={value.granularity === granularity}
                            onClick={() => setGranularity(granularity)}
                        >
                            {granularity[0].toUpperCase() +
                                granularity.slice(1)}
                        </TabButton>
                    ),
                )}
            </div>
            <button
                type="button"
                aria-expanded={open}
                aria-haspopup="dialog"
                aria-label={`Select usage period, current ${formatPeriodLabel(value)}`}
                onClick={() => setOpen((isOpen) => !isOpen)}
                className={cn(
                    "inline-flex min-w-[150px] items-center justify-between gap-2 rounded-full border px-4 pt-1.5 pb-2 text-left text-base font-medium leading-normal",
                    "border-theme-border bg-theme-bg-subtle text-theme-text-base",
                    "transition-all duration-200 ease-out hover:bg-theme-bg-pale",
                    open &&
                        "bg-theme-bg-active text-theme-text-strong shadow-sm",
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
                <div
                    role="dialog"
                    aria-label="Usage period picker"
                    className="absolute left-0 top-full z-30 mt-2 w-[304px] rounded-xl border bg-white p-3 shadow-lg transition-opacity duration-200 ease-out border-theme-border"
                >
                    <div className="mb-3 flex items-center justify-between">
                        <button
                            type="button"
                            aria-label={
                                value.granularity === "month"
                                    ? "Previous year"
                                    : "Previous month"
                            }
                            disabled={previousDisabled}
                            onClick={() => setViewDate(previousViewDate)}
                            className={cn(
                                "rounded-full px-2 py-1 text-xs font-semibold transition-colors text-theme-text-base hover:bg-theme-bg-subtle",
                                previousDisabled &&
                                    "cursor-not-allowed opacity-30 hover:bg-transparent",
                            )}
                        >
                            {"<"}
                        </button>
                        <div className="text-sm font-bold text-theme-text-base">
                            {viewLabel}
                        </div>
                        <button
                            type="button"
                            aria-label={
                                value.granularity === "month"
                                    ? "Next year"
                                    : "Next month"
                            }
                            disabled={nextDisabled}
                            onClick={() => setViewDate(nextViewDate)}
                            className={cn(
                                "rounded-full px-2 py-1 text-xs font-semibold transition-colors text-theme-text-base hover:bg-theme-bg-subtle",
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
                                const ariaLabel = date.toLocaleDateString(
                                    "en-US",
                                    {
                                        timeZone: "UTC",
                                        month: "long",
                                        year: "numeric",
                                    },
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
                                        aria-label={ariaLabel}
                                        disabled={!selectable}
                                        onClick={() => selectDate(date)}
                                        className={cn(
                                            "rounded-lg px-3 py-2 text-xs font-medium transition-colors duration-150",
                                            selected
                                                ? "bg-theme-bg-active text-theme-text-strong"
                                                : "text-gray-700 hover:bg-theme-bg-subtle",
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
                            <div className="mb-1 grid grid-cols-7 gap-1 text-center text-micro font-bold uppercase text-gray-400">
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
                                    const ariaLabel =
                                        value.granularity === "week"
                                            ? `Select week ${formatPeriodLabel(periodFromDate("week", date))}`
                                            : `Select ${date.toLocaleDateString(
                                                  "en-US",
                                                  {
                                                      timeZone: "UTC",
                                                      weekday: "long",
                                                      month: "long",
                                                      day: "numeric",
                                                      year: "numeric",
                                                  },
                                              )}`;
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
                                            aria-label={ariaLabel}
                                            disabled={!selectable}
                                            onClick={() => selectDate(date)}
                                            className={cn(
                                                "aspect-square rounded-lg text-xs font-medium transition-colors duration-150",
                                                !inCurrentMonth &&
                                                    "text-gray-300",
                                                sameUtcDay(date, today) &&
                                                    "ring-1 ring-theme-border",
                                                selected
                                                    ? "bg-theme-bg-active text-theme-text-strong"
                                                    : "text-gray-700 hover:bg-theme-bg-subtle",
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
