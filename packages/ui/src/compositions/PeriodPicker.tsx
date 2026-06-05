import type { FC } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../lib/cn.ts";
import {
    addUtcDays,
    isPeriodSelectable,
    type PeriodGranularity,
    type PeriodSelection,
    periodFromDate,
    periodToWindow,
    startOfUtcDay,
} from "../lib/period.ts";
import { ChevronIcon } from "../primitives/ChevronIcon.tsx";
import { Dropdown } from "../primitives/Dropdown.tsx";
import { TabButton } from "../primitives/TabButton.tsx";
import type { ThemeName } from "../theme.ts";

export type PeriodPickerProps = {
    value: PeriodSelection;
    onChange: (value: PeriodSelection) => void;
    theme: ThemeName;
    minDate?: Date;
    maxDate?: Date;
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

const NAV_BUTTON =
    "polli-control polli:rounded-full polli:px-2 polli:py-1 polli:text-xs polli:font-semibold polli:text-theme-text-base polli:transition-colors polli:hover:bg-theme-bg-subtle";

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

function periodDate(value: PeriodSelection): Date {
    return periodToWindow(value).start;
}

function selectionKey(value: PeriodSelection): string {
    return `${value.granularity}:${value.period}`;
}

function formatMonthYear(date: Date, month: "short" | "long" = "short") {
    return date.toLocaleDateString("en-US", {
        timeZone: "UTC",
        month,
        year: "numeric",
    });
}

function formatFullDate(date: Date) {
    return date.toLocaleDateString("en-US", {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

function formatWeekSummary(start: Date, end: Date) {
    const weekEnd = addUtcDays(end, -1);
    const sameMonth =
        start.getUTCFullYear() === weekEnd.getUTCFullYear() &&
        start.getUTCMonth() === weekEnd.getUTCMonth();

    if (sameMonth) {
        const month = start.toLocaleDateString("en-US", {
            timeZone: "UTC",
            month: "short",
        });
        return `${month} ${start.getUTCDate()}-${weekEnd.getUTCDate()}, ${weekEnd.getUTCFullYear()}`;
    }

    return `${formatFullDate(start)} - ${formatFullDate(weekEnd)}`;
}

function formatPeriodSummary(value: PeriodSelection): string {
    const { start, end } = periodToWindow(value);
    if (value.granularity === "day") return formatFullDate(start);
    if (value.granularity === "week") return formatWeekSummary(start, end);
    return formatMonthYear(start, "long");
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
    minDate = new Date(0),
    maxDate,
}) => {
    const [open, setOpen] = useState(false);
    const [viewDate, setViewDate] = useState<Date>(() => periodDate(value));
    const [anchorDate, setAnchorDate] = useState<Date>(() => periodDate(value));
    const emittedSelectionRef = useRef<string | null>(null);
    const { granularity, period } = value;

    useEffect(() => {
        const currentSelectionKey = selectionKey({ granularity, period });
        if (emittedSelectionRef.current === currentSelectionKey) {
            emittedSelectionRef.current = null;
            return;
        }
        const nextAnchorDate = periodDate({ granularity, period });
        setAnchorDate(nextAnchorDate);
        setViewDate(nextAnchorDate);
    }, [granularity, period]);

    const dates = useMemo(() => monthGridDates(viewDate), [viewDate]);
    const selectedWindow = periodToWindow(value);
    const today = startOfUtcDay(maxDate);
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
    const summaryLabel = formatPeriodSummary(value);

    const commitSelection = (selection: PeriodSelection, anchor: Date) => {
        emittedSelectionRef.current = selectionKey(selection);
        setAnchorDate(anchor);
        setViewDate(anchor);
        onChange(selection);
    };

    const setGranularity = (granularity: PeriodGranularity) => {
        commitSelection(periodFromDate(granularity, anchorDate), anchorDate);
    };

    const selectDate = (date: Date) => {
        commitSelection(periodFromDate(value.granularity, date), date);
        setOpen(false);
    };

    const viewLabel =
        value.granularity === "month"
            ? String(viewDate.getUTCFullYear())
            : formatMonthYear(viewDate, "long");

    return (
        <div
            data-theme={theme}
            className="polli:flex polli:flex-wrap polli:items-center polli:gap-2"
        >
            <div className="polli:flex polli:flex-wrap polli:gap-1.5">
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
            <Dropdown
                theme={theme}
                open={open}
                onOpenChange={setOpen}
                className="polli:w-[320px] polli:rounded-xl polli:p-3.5"
                trigger={(isOpen) => (
                    <button
                        type="button"
                        aria-label={`Select period, current ${summaryLabel}`}
                        className={cn(
                            "polli-control polli:inline-flex polli:w-[19rem] polli:max-w-full polli:items-center polli:justify-between polli:gap-2 polli:rounded-full polli:border polli:px-5 polli:pt-2 polli:pb-2.5 polli:text-left polli:text-base polli:font-medium polli:leading-normal",
                            "polli:border-theme-border polli:bg-theme-bg-subtle polli:text-theme-text-base",
                            "polli:transition-all polli:duration-200 polli:ease-out polli:hover:bg-theme-bg-pale",
                            isOpen &&
                                "polli:bg-theme-bg-active polli:text-theme-text-strong polli:shadow-sm",
                        )}
                    >
                        <span className="polli:truncate">{summaryLabel}</span>
                        <ChevronIcon expanded={isOpen} />
                    </button>
                )}
            >
                <div className="polli:mb-3 polli:flex polli:items-center polli:justify-between">
                    <button
                        type="button"
                        aria-label="Previous"
                        disabled={previousDisabled}
                        onClick={() => setViewDate(previousViewDate)}
                        className={cn(
                            NAV_BUTTON,
                            previousDisabled &&
                                "polli:cursor-not-allowed polli:opacity-30 polli:hover:bg-transparent",
                        )}
                    >
                        {"<"}
                    </button>
                    <div className="polli:text-base polli:font-bold polli:text-theme-text-base">
                        {viewLabel}
                    </div>
                    <button
                        type="button"
                        aria-label="Next"
                        disabled={nextDisabled}
                        onClick={() => setViewDate(nextViewDate)}
                        className={cn(
                            NAV_BUTTON,
                            nextDisabled &&
                                "polli:cursor-not-allowed polli:opacity-30 polli:hover:bg-transparent",
                        )}
                    >
                        {">"}
                    </button>
                </div>

                {value.granularity === "month" ? (
                    <div className="polli:grid polli:grid-cols-3 polli:gap-1.5">
                        {MONTH_LABELS.map((label, monthIndex) => {
                            const date = new Date(
                                Date.UTC(
                                    viewDate.getUTCFullYear(),
                                    monthIndex,
                                    1,
                                ),
                            );
                            const selectable = isPeriodSelectable(
                                periodFromDate("month", date),
                                minDate,
                                today,
                            );
                            const ariaLabel = date.toLocaleDateString("en-US", {
                                timeZone: "UTC",
                                month: "long",
                                year: "numeric",
                            });
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
                                        "polli-control polli:rounded-lg polli:px-3 polli:py-2 polli:text-sm polli:font-medium polli:transition-colors polli:duration-150",
                                        selected
                                            ? "polli:bg-theme-bg-active polli:text-theme-text-strong"
                                            : "polli:text-gray-700 polli:hover:bg-theme-bg-subtle",
                                        !selectable &&
                                            "polli:cursor-not-allowed polli:text-gray-300 polli:hover:bg-transparent",
                                    )}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <>
                        <div className="polli:mb-1 polli:grid polli:grid-cols-7 polli:gap-1 polli:text-center polli:text-xs polli:font-bold polli:uppercase polli:text-gray-400">
                            {WEEKDAY_LABELS.map((label) => (
                                <div key={label}>{label}</div>
                            ))}
                        </div>
                        <div className="polli:grid polli:grid-cols-7 polli:gap-1">
                            {dates.map((date) => {
                                const inCurrentMonth =
                                    date.getUTCMonth() ===
                                    viewDate.getUTCMonth();
                                const selectable = isPeriodSelectable(
                                    periodFromDate(value.granularity, date),
                                    minDate,
                                    today,
                                );
                                const ariaLabel =
                                    value.granularity === "week"
                                        ? `Select ${formatPeriodSummary(periodFromDate("week", date))}`
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
                                        ? sameUtcDay(date, selectedWindow.start)
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
                                            "polli-control polli:aspect-square polli:rounded-lg polli:text-sm polli:font-medium polli:transition-colors polli:duration-150",
                                            !inCurrentMonth &&
                                                "polli:text-gray-300",
                                            sameUtcDay(date, today) &&
                                                "polli:ring-1 polli:ring-theme-border",
                                            selected
                                                ? "polli:bg-theme-bg-active polli:text-theme-text-strong"
                                                : "polli:text-gray-700 polli:hover:bg-theme-bg-subtle",
                                            !selectable &&
                                                "polli:cursor-not-allowed polli:text-gray-300 polli:hover:bg-transparent",
                                        )}
                                    >
                                        {date.getUTCDate()}
                                    </button>
                                );
                            })}
                        </div>
                    </>
                )}
            </Dropdown>
        </div>
    );
};
