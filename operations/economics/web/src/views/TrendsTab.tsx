import { Heading, Surface, TabButton } from "@pollinations/ui";
import { type ReactNode, useMemo, useState } from "react";
import { FilterMultiSelect } from "../components/Filters";
import { categoryLabel, EXPENSE_CATEGORY_ORDER } from "../lib/categories";
import { fmtUsd as axisUsd, fmtNumber } from "../lib/format";
import { monthLabel, monthName } from "../lib/months";
import {
    monthlyPollenTrends,
    monthlyTrends,
    type PollenTrendMonth,
    type TrendMonth,
    trendPeriod,
} from "../lib/trends";
import type { Data } from "../types";
import { fmtRunwayUsd as usd } from "./RunwayTab";

type ExpenseCategory = (typeof EXPENSE_CATEGORY_ORDER)[number];
type TrendRow = TrendMonth & PollenTrendMonth;
type Series = {
    key:
        | "revenue"
        | "paidCost"
        | "result"
        | "fullResult"
        | "credits"
        | "paidPollen"
        | "questPollen"
        | "questCash"
        | "questCredits"
        | ExpenseCategory;
    label: string;
    color: string;
    dashed?: boolean;
    adjustedKey?: "adjustedResult" | "adjustedFullResult";
};
const USAGE_SERIES: Series[] = [
    { key: "paidPollen", label: "Paid used", color: "#60a5fa" },
    { key: "questPollen", label: "Quest used", color: "#2dd4bf", dashed: true },
];
const QUEST_FUNDING_SERIES: Series[] = [
    { key: "questCash", label: "Cash-funded", color: "#f472b6" },
    {
        key: "questCredits",
        label: "Credit-funded",
        color: "#c084fc",
        dashed: true,
    },
];
const EXPENSE_COLORS = [
    "#fbbf24",
    "#2dd4bf",
    "#c084fc",
    "#fb7185",
    "#60a5fa",
    "#fb923c",
    "#a3e635",
    "#e879f9",
];
const EXPENSE_SERIES: Series[] = EXPENSE_CATEGORY_ORDER.map((key, i) => ({
    key,
    label: categoryLabel(key),
    color: EXPENSE_COLORS[i],
}));
const RESULT_SERIES: Series[] = [
    {
        key: "result",
        label: "With credits",
        color: "#60a5fa",
        adjustedKey: "adjustedResult",
    },
    {
        key: "fullResult",
        adjustedKey: "adjustedFullResult",
        label: "Without credits",
        color: "#fbbf24",
        dashed: true,
    },
];
const FUNDING_SERIES: Series[] = [
    { key: "paidCost", label: "Cash-funded costs", color: "#f472b6" },
    { key: "credits", label: "Credits used", color: "#c084fc", dashed: true },
];

function TrendChart({
    title,
    rows,
    series,
    kind = "line",
    activeMonth,
    onInspect,
    controls,
    unit = "USD",
    note,
    creditKey,
}: {
    title: string;
    rows: TrendRow[];
    series: Series[];
    kind?: "line" | "bar" | "stacked";
    activeMonth: string | null;
    onInspect: (month: string | null) => void;
    controls?: ReactNode;
    unit?: "USD" | "Pollen";
    note?: string;
    creditKey?: "credits" | "questCredits";
}) {
    const active =
        rows.find((row) => row.month === activeMonth) ??
        [...rows]
            .reverse()
            .find((row) => series.some((s) => row[s.key] != null));
    const format = unit === "Pollen" ? fmtNumber : usd;
    const funded = active && creditKey ? active[creditKey] : null;
    const total =
        active && series.every((s) => active[s.key] != null)
            ? series.reduce((sum, s) => sum + (active[s.key] ?? 0), 0)
            : null;
    const values = series.flatMap((s) =>
        rows.flatMap((r) =>
            [r[s.key], s.adjustedKey ? r[s.adjustedKey] : null].filter(
                (value): value is number => value != null,
            ),
        ),
    );
    if (kind === "stacked") {
        for (const row of rows) {
            const known = series
                .map((s) => row[s.key])
                .filter((n): n is number => n != null);
            if (known.length) {
                values.push(
                    known.filter((n) => n > 0).reduce((a, b) => a + b, 0),
                );
                values.push(
                    known.filter((n) => n < 0).reduce((a, b) => a + b, 0),
                );
            }
        }
    }
    const low = Math.min(0, ...values);
    const high = Math.max(0, ...values) || (low === 0 ? 1 : 0);
    const step = 10 ** Math.floor(Math.log10((high - low) / 4));
    const tickStep =
        step * ([1, 2, 5, 10].find((n) => step * n >= (high - low) / 4) ?? 10);
    const padding = (high - low) * 0.06;
    const min = low < 0 ? low - padding : 0;
    const max = high > 0 ? high + padding : 0;
    const firstTick = Math.ceil(min / tickStep) * tickStep;
    const ticks = Array.from(
        { length: Math.floor((max - firstTick) / tickStep) + 1 },
        (_, i) => firstTick + i * tickStep,
    );
    const slot = 528 / Math.max(1, rows.length);
    const x = (i: number) => 64 + slot * (i + 0.5);
    const y = (value: number) => 208 - ((value - min) / (max - min)) * 184;
    const barWidth = Math.min(18, slot * 0.28);
    return (
        <Surface className="w-full min-w-0 max-w-4xl p-4 sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Heading as="h3">{title}</Heading>
                {controls}
                <span className="text-xs text-theme-text-soft">
                    {active ? `${monthName(active.month)} · ${unit}` : unit}
                </span>
            </div>
            {note && (
                <p className="mt-1 text-xs text-theme-text-soft">{note}</p>
            )}
            <div
                className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs tabular-nums"
                aria-live="polite"
            >
                {series.map((s) => (
                    <span
                        key={s.key}
                        className="inline-flex items-center gap-1.5"
                    >
                        <svg width="18" height="10" aria-hidden="true">
                            <line
                                x1="0"
                                x2="18"
                                y1="5"
                                y2="5"
                                stroke={s.color}
                                strokeWidth="3"
                                strokeDasharray={s.dashed ? "4 2" : undefined}
                            />
                        </svg>
                        <span className="text-theme-text-soft">{s.label}</span>
                        <strong>{format(active?.[s.key])}</strong>
                        {s.adjustedKey && active?.[s.adjustedKey] != null && (
                            <span>◇ {usd(active[s.adjustedKey])}</span>
                        )}
                    </span>
                ))}
                {kind === "bar" &&
                    rows.some((row) => row.oneOffFraud != null) && (
                        <span className="text-theme-text-soft">
                            ◇ Excluding identified fraud costs
                        </span>
                    )}
                {funded != null &&
                    total != null &&
                    total > 0 &&
                    funded >= 0 &&
                    funded <= total && (
                        <strong>
                            {Math.round((100 * funded) / total)}% funded by
                            credits
                        </strong>
                    )}
            </div>
            <div className="mt-2 overflow-x-auto">
                <svg
                    viewBox="0 0 620 246"
                    className="mx-auto w-full max-w-3xl"
                    aria-label={`${title}. ${unit} by month; select a month to inspect values.`}
                >
                    <title>{title}</title>
                    {ticks.map((value) => (
                        <g key={value}>
                            <line
                                x1="64"
                                x2="592"
                                y1={y(value)}
                                y2={y(value)}
                                stroke="currentColor"
                                opacity={value === 0 ? 0.45 : 0.1}
                            />
                            <text
                                x="55"
                                y={y(value) + 4}
                                textAnchor="end"
                                fill="currentColor"
                                fontSize="12"
                            >
                                {unit === "Pollen"
                                    ? fmtNumber(value)
                                    : axisUsd(value)}
                            </text>
                        </g>
                    ))}
                    {rows.map((row, i) => (
                        <g key={row.month}>
                            {row.month === activeMonth && (
                                <rect
                                    x={x(i) - slot / 2}
                                    y="16"
                                    width={slot}
                                    height="199"
                                    fill="currentColor"
                                    opacity="0.04"
                                />
                            )}
                            <text
                                x={x(i)}
                                y="235"
                                textAnchor="middle"
                                fill="currentColor"
                                fontSize="12"
                            >
                                {monthName(row.month).slice(0, 3)}
                            </text>
                        </g>
                    ))}
                    {series.map((s, j) => (
                        <g key={s.key}>
                            {rows.map((row, i) => {
                                const value = row[s.key],
                                    previous = rows[i - 1];
                                if (value == null) return null;
                                if (kind === "line")
                                    return (
                                        <g key={row.month}>
                                            {previous?.[s.key] != null && (
                                                <line
                                                    x1={x(i - 1)}
                                                    x2={x(i)}
                                                    y1={y(
                                                        previous[
                                                            s.key
                                                        ] as number,
                                                    )}
                                                    y2={y(value)}
                                                    stroke={s.color}
                                                    strokeWidth="2.5"
                                                    strokeDasharray={
                                                        s.dashed
                                                            ? "6 4"
                                                            : undefined
                                                    }
                                                />
                                            )}
                                            <circle
                                                cx={x(i)}
                                                cy={y(value)}
                                                r={
                                                    row.month === activeMonth
                                                        ? 5
                                                        : 3
                                                }
                                                fill={s.color}
                                                opacity={1}
                                            />
                                        </g>
                                    );
                                const base =
                                    kind === "stacked"
                                        ? series
                                              .slice(0, j)
                                              .reduce((sum, prior) => {
                                                  const n = row[prior.key] ?? 0;
                                                  return (
                                                      sum +
                                                      (value >= 0
                                                          ? Math.max(0, n)
                                                          : Math.min(0, n))
                                                  );
                                              }, 0)
                                        : 0;
                                const left =
                                    kind === "stacked"
                                        ? x(i) - barWidth
                                        : x(i) +
                                          (j - series.length / 2) *
                                              (barWidth + 2);
                                const adjusted = s.adjustedKey
                                    ? row[s.adjustedKey]
                                    : null;
                                return (
                                    <g key={row.month}>
                                        <rect
                                            x={left}
                                            y={Math.min(
                                                y(base),
                                                y(base + value),
                                            )}
                                            width={
                                                kind === "stacked"
                                                    ? barWidth * 2
                                                    : barWidth
                                            }
                                            height={Math.max(
                                                1,
                                                Math.abs(
                                                    y(base + value) - y(base),
                                                ),
                                            )}
                                            fill={
                                                s.dashed && kind === "bar"
                                                    ? "none"
                                                    : s.color
                                            }
                                            stroke={s.color}
                                            strokeWidth="1.5"
                                            strokeDasharray={
                                                s.dashed ? "4 2" : undefined
                                            }
                                            opacity={1}
                                        />
                                        {kind === "bar" && adjusted != null && (
                                            <path
                                                d={`M ${left + barWidth / 2} ${y(adjusted) - 5} l 5 5 l -5 5 l -5 -5 Z`}
                                                fill={s.color}
                                                stroke="var(--color-surface-opaque, #242321)"
                                                strokeWidth="1.5"
                                                aria-label={`${monthName(row.month)} ${s.label}, excluding identified fraud costs: ${usd(adjusted)}`}
                                            />
                                        )}
                                    </g>
                                );
                            })}
                        </g>
                    ))}
                    {rows.map((row, i) => (
                        <foreignObject
                            key={row.month}
                            x={x(i) - slot / 2}
                            y="16"
                            width={slot}
                            height="201"
                        >
                            <button
                                type="button"
                                aria-label={`Inspect ${monthName(row.month)} ${row.month.slice(0, 4)}`}
                                className="block h-full w-full cursor-crosshair border-0 bg-transparent p-0 focus-visible:outline focus-visible:outline-1 focus-visible:outline-current"
                                onMouseEnter={() => onInspect(row.month)}
                                onFocus={() => onInspect(row.month)}
                                onClick={() => onInspect(row.month)}
                            />
                        </foreignObject>
                    ))}
                </svg>
            </div>
        </Surface>
    );
}

export function TrendsTab({
    data,
    period,
    onPeriodChange,
}: {
    data: Data;
    period: 3 | 6 | 12;
    onPeriodChange: (period: 3 | 6 | 12) => void;
}) {
    const [categories, setCategories] = useState<string[]>([
        "compute",
        "infrastructure",
        "development",
    ]);
    const [activeMonth, setActiveMonth] = useState<string | null>(null);
    const months = useMemo(() => {
        const company = monthlyTrends(data, "company").months;
        const pollen = monthlyPollenTrends(
            data,
            company.map((row) => row.month),
        );
        return company.map(
            (row, i): TrendRow => ({
                ...row,
                ...pollen[i],
            }),
        );
    }, [data]);
    const { start, end } = trendPeriod(period);
    const rows = months.filter((row) => row.month >= start && row.month <= end);
    const selected =
        rows.find((row) => row.month === activeMonth) ?? rows.at(-1);
    const chartProps = {
        rows,
        activeMonth: selected?.month ?? null,
        onInspect: setActiveMonth,
    };
    const selectedExpenses = EXPENSE_SERIES.filter(
        (s) => !categories.length || categories.includes(s.key),
    );
    return (
        <section className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-3">
                <fieldset className="flex gap-1.5" aria-label="Chart period">
                    {([3, 6, 12] as const).map((value) => (
                        <TabButton
                            key={value}
                            active={period === value}
                            onClick={() => {
                                setActiveMonth(null);
                                onPeriodChange(value);
                            }}
                            size="md"
                            variant="soft"
                        >
                            {value} months
                        </TabButton>
                    ))}
                </fieldset>
                <span className="text-xs text-theme-text-soft">
                    {monthLabel(start)} – {monthLabel(end)}
                </span>
            </div>
            <div className="grid min-w-0 gap-5 lg:grid-cols-2">
                <TrendChart
                    title="Monthly result"
                    series={RESULT_SERIES}
                    kind="bar"
                    {...chartProps}
                />
                <TrendChart
                    title="Expenses before credits"
                    series={selectedExpenses}
                    controls={
                        <FilterMultiSelect
                            placeholder="Expense categories"
                            options={EXPENSE_CATEGORY_ORDER.map((value) => ({
                                value,
                                label: categoryLabel(value),
                            }))}
                            value={categories}
                            onChange={setCategories}
                        />
                    }
                    {...chartProps}
                />
                <TrendChart
                    title="Cost funding"
                    series={FUNDING_SERIES}
                    kind="stacked"
                    creditKey="credits"
                    {...chartProps}
                />
                <TrendChart
                    title="Pollen consumed"
                    note="Whole platform · usage, not sales"
                    series={USAGE_SERIES}
                    unit="Pollen"
                    {...chartProps}
                />
                <TrendChart
                    title="Quest serving costs"
                    note="Allocated by usage · already included in Compute"
                    series={QUEST_FUNDING_SERIES}
                    kind="stacked"
                    creditKey="questCredits"
                    {...chartProps}
                />
            </div>
        </section>
    );
}
