import { Button, Heading, Surface } from "@pollinations/ui";
import { useMemo, useState } from "react";
import { fmtUsd as axisUsd } from "../lib/format";
import {
    latestClosedMonth,
    monthName,
    monthShift,
    yearsOf,
} from "../lib/months";
import { monthlyTrends, type TrendMonth, type TrendScope } from "../lib/trends";
import type { Data } from "../types";
import { fmtRunwayUsd as usd } from "./RunwayTab";

type Series = {
    key:
        | "revenue"
        | "paidCost"
        | "fullCost"
        | "result"
        | "fullResult"
        | "credits"
        | "computeCost"
        | "infrastructureCost"
        | "operationsCost";
    label: string;
    color: string;
    dashed?: boolean;
};
const COST_SERIES: Series[] = [
    { key: "revenue", label: "Revenue after deductions", color: "#60a5fa" },
    { key: "fullCost", label: "Full costs", color: "#fbbf24", dashed: true },
    { key: "paidCost", label: "Costs after credits", color: "#f472b6" },
];
const EXPENSE_SERIES: Series[] = [
    { key: "computeCost", label: "Compute", color: "#fbbf24" },
    {
        key: "infrastructureCost",
        label: "Infrastructure",
        color: "#2dd4bf",
        dashed: true,
    },
    { key: "operationsCost", label: "Other operations", color: "#c084fc" },
];
const RESULT_SERIES: Series[] = [
    { key: "result", label: "With credits", color: "#60a5fa" },
    {
        key: "fullResult",
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
}: {
    title: string;
    rows: TrendMonth[];
    series: Series[];
    kind?: "line" | "bar" | "stacked";
    activeMonth: string | null;
    onInspect: (month: string | null) => void;
}) {
    const active =
        rows.find((row) => row.month === activeMonth) ??
        [...rows]
            .reverse()
            .find((row) => series.some((s) => row[s.key] != null));
    const values = series.flatMap((s) =>
        rows.flatMap((r) => (r[s.key] == null ? [] : [r[s.key] as number])),
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
        <Surface className="min-w-0 p-4 sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Heading as="h3">{title}</Heading>
                <span className="text-xs text-theme-text-soft">
                    {active
                        ? `${monthName(active.month)}${active.provisional ? "*" : ""}`
                        : "USD"}
                </span>
            </div>
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
                        <strong>{usd(active?.[s.key])}</strong>
                    </span>
                ))}
            </div>
            <div className="mt-2 overflow-x-auto">
                <svg
                    viewBox="0 0 620 246"
                    className="w-full min-w-[520px]"
                    aria-label={`${title}. USD by month; exact values in Monthly details.`}
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
                                {axisUsd(value)}
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
                                {row.provisional ? "*" : ""}
                            </text>
                        </g>
                    ))}
                    {series.map((s, j) => (
                        <g key={s.key}>
                            {rows.map((row, i) => {
                                const value = row[s.key],
                                    previous = rows[i - 1];
                                if (value == null) return null;
                                const muted = row.provisional ? 0.65 : 1;
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
                                                    opacity={
                                                        row.provisional ||
                                                        previous.provisional
                                                            ? 0.65
                                                            : 1
                                                    }
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
                                                opacity={muted}
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
                                return (
                                    <rect
                                        key={row.month}
                                        x={left}
                                        y={Math.min(y(base), y(base + value))}
                                        width={
                                            kind === "stacked"
                                                ? barWidth * 2
                                                : barWidth
                                        }
                                        height={Math.max(
                                            1,
                                            Math.abs(y(base + value) - y(base)),
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
                                        opacity={muted}
                                    />
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
                                onMouseLeave={() => onInspect(null)}
                                onFocus={() => onInspect(row.month)}
                                onBlur={() => onInspect(null)}
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
    year = "2026",
    onYearChange,
}: {
    data: Data;
    year?: string;
    onYearChange?: (year: string) => void;
}) {
    const [scope, setScope] = useState<TrendScope>("company");
    const [fullYear, setFullYear] = useState(true);
    const [activeMonth, setActiveMonth] = useState<string | null>(null);
    const { months } = useMemo(() => monthlyTrends(data, scope), [data, scope]);
    const yearRows = months.filter((row) => row.month.startsWith(year));
    const end = latestClosedMonth(yearRows.map((row) => row.month));
    const rows = fullYear
        ? yearRows
        : yearRows.filter(
              (row) =>
                  end && row.month >= monthShift(end, -5) && row.month <= end,
          );
    const label = scope === "compute" ? "API + GPU" : "Whole company";
    const chartProps = { rows, activeMonth, onInspect: setActiveMonth };
    const details = [
        ["gross", "Gross sales"],
        ["deductions", "Deductions"],
        ["revenue", "Revenue after deductions"],
        ["computeCost", "Compute"],
        ["infrastructureCost", "Infrastructure"],
        ["operationsCost", "Other operations"],
        ["paidCost", "Cash-funded costs"],
        ["credits", "Credits used"],
        ["fullCost", "Full costs"],
        ["result", "Result with credits"],
        ["fullResult", "Result without credits"],
    ] as const;
    return (
        <section className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-3">
                <select
                    aria-label="Year"
                    value={year}
                    onChange={(event) => onYearChange?.(event.target.value)}
                    className="rounded-full border border-theme-border bg-surface-opaque px-3 py-2 text-sm font-semibold text-theme-text-strong"
                >
                    {yearsOf(months.map((row) => row.month)).map((value) => (
                        <option key={value} value={value}>
                            {value}
                        </option>
                    ))}
                </select>
                <fieldset className="flex gap-2" aria-label="Cost scope">
                    {(
                        [
                            ["compute", "API + GPU"],
                            ["company", "Whole company"],
                        ] as const
                    ).map(([value, name]) => (
                        <Button
                            key={value}
                            size="sm"
                            intent={scope === value ? "brand" : "neutral"}
                            aria-pressed={scope === value}
                            onClick={() => setScope(value)}
                        >
                            {name}
                        </Button>
                    ))}
                </fieldset>
                <fieldset className="flex gap-2" aria-label="Chart range">
                    <Button
                        size="sm"
                        intent={fullYear ? "neutral" : "brand"}
                        aria-pressed={!fullYear}
                        onClick={() => setFullYear(false)}
                    >
                        Recent 6 months
                    </Button>
                    <Button
                        size="sm"
                        intent={fullYear ? "brand" : "neutral"}
                        aria-pressed={fullYear}
                        onClick={() => setFullYear(true)}
                    >
                        Full year
                    </Button>
                </fieldset>
            </div>
            <div className="grid min-w-0 gap-5 2xl:grid-cols-2">
                <TrendChart
                    title="Revenue versus costs"
                    series={COST_SERIES}
                    {...chartProps}
                />
                <TrendChart
                    title="Expenses before credits"
                    series={
                        scope === "compute"
                            ? EXPENSE_SERIES.slice(0, 1)
                            : EXPENSE_SERIES
                    }
                    {...chartProps}
                />
                <TrendChart
                    title="Monthly result"
                    series={RESULT_SERIES}
                    kind="bar"
                    {...chartProps}
                />
                <TrendChart
                    title="Cost funding"
                    series={FUNDING_SERIES}
                    kind="stacked"
                    {...chartProps}
                />
            </div>
            <details className="text-sm">
                <summary className="cursor-pointer font-semibold">
                    Monthly details
                </summary>
                <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-right tabular-nums">
                        <caption className="mb-2 text-left">
                            {label} · USD · * provisional; gaps mean missing
                            data
                        </caption>
                        <thead>
                            <tr>
                                <th className="px-3 py-2 text-left">Month</th>
                                {details
                                    .filter(
                                        ([key]) =>
                                            scope === "company" ||
                                            ![
                                                "infrastructureCost",
                                                "operationsCost",
                                            ].includes(key),
                                    )
                                    .map(([key, heading]) => (
                                        <th key={key} className="px-3 py-2">
                                            {heading}
                                        </th>
                                    ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr
                                    key={row.month}
                                    className="border-t border-theme-border"
                                >
                                    <th
                                        scope="row"
                                        className="whitespace-nowrap px-3 py-2 text-left"
                                    >
                                        {monthName(row.month)}
                                        {row.provisional ? "*" : ""}
                                    </th>
                                    {details
                                        .filter(
                                            ([key]) =>
                                                scope === "company" ||
                                                ![
                                                    "infrastructureCost",
                                                    "operationsCost",
                                                ].includes(key),
                                        )
                                        .map(([key]) => (
                                            <td
                                                key={key}
                                                className="whitespace-nowrap px-3 py-2"
                                            >
                                                {usd(row[key])}
                                            </td>
                                        ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </details>
        </section>
    );
}
