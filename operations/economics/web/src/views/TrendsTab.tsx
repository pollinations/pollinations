import { Heading, Surface, TabButton } from "@pollinations/ui";
import { useMemo, useState } from "react";
import { ProductMixCard } from "../components/ProductMixCard";
import { useAmountDisplay } from "../components/ReconcilePro";
import { TrendPlot } from "../components/TrendPlot";
import {
    categoryLabel,
    EXPENSE_CATEGORY_ORDER,
    isComputeOrInfrastructureCategory,
} from "../lib/categories";
import { fmtUsd as axisUsd } from "../lib/format";
import { monthLabel, monthName, monthShift } from "../lib/months";
import { monthlyProductMix } from "../lib/productMix";
import type { ReconciliationIssue } from "../lib/reconciliation";
import {
    monthlyPollenTrends,
    monthlyTrends,
    type PollenTrendMonth,
    type TrendMonth,
    type TrendScope,
    trendPercentChange,
    trendPeriod,
} from "../lib/trends";
import { unitEconomicsReport } from "../lib/unitEconomics";
import type { Data } from "../types";

type ExpenseCategory = (typeof EXPENSE_CATEGORY_ORDER)[number];
type TrendRow = TrendMonth &
    PollenTrendMonth & {
        overhead: number | null;
        salesProvisional: boolean;
        pollenProvisional: boolean;
    };
type Series = {
    key:
        | "gross"
        | "revenue"
        | "paidCost"
        | "result"
        | "fullResult"
        | "credits"
        | "paidPollen"
        | "questPollen"
        | "questCash"
        | "questCredits"
        | ExpenseCategory
        | "overhead";
    label: string;
    color: string;
    dashed?: boolean;
    adjustedKey?: "adjustedResult" | "adjustedFullResult";
};
const SALES_SERIES: Series[] = [
    { key: "gross", label: "Customer payments", color: "#60a5fa" },
    {
        key: "revenue",
        label: "After deductions",
        color: "#2dd4bf",
        dashed: true,
    },
];
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
const EXPENSE_SERIES: Series[] = [
    { key: "compute", label: categoryLabel("compute"), color: "#fbbf24" },
    {
        key: "infrastructure",
        label: categoryLabel("infrastructure"),
        color: "#2dd4bf",
    },
    { key: "overhead", label: "Company overhead", color: "#c084fc" },
];
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
    previousRow,
    onInspect,
    hiddenSeries = [],
    onToggleSeries,
    unit = "USD",
    note,
    creditKey,
    scope,
    onScopeChange,
}: {
    title: string;
    rows: TrendRow[];
    series: Series[];
    kind?: "line" | "bar" | "stacked";
    activeMonth: string | null;
    previousRow?: TrendRow;
    onInspect: (month: string | null) => void;
    hiddenSeries?: Series["key"][];
    onToggleSeries?: (key: Series["key"]) => void;
    unit?: "USD" | "Pollen";
    note?: string;
    creditKey?: "credits" | "questCredits";
    scope?: TrendScope;
    onScopeChange?: (scope: TrendScope) => void;
}) {
    const { fmtNumber, fmtUsd: usd } = useAmountDisplay();
    const visibleSeries = series.filter((s) => !hiddenSeries.includes(s.key));
    const LegendItem = onToggleSeries ? "button" : "span";
    const active =
        rows.find((row) => row.month === activeMonth) ??
        [...rows]
            .reverse()
            .find((row) => visibleSeries.some((s) => row[s.key] != null));
    const provisional = (row: TrendRow | undefined) =>
        row &&
        (series.every((s) => s.key === "gross" || s.key === "revenue")
            ? row.salesProvisional
            : unit === "Pollen"
              ? row.pollenProvisional
              : row.provisional);
    const format = unit === "Pollen" ? fmtNumber : usd;
    const funded = active && creditKey ? active[creditKey] : null;
    const total =
        active && visibleSeries.every((s) => active[s.key] != null)
            ? visibleSeries.reduce((sum, s) => sum + (active[s.key] ?? 0), 0)
            : null;
    const values = visibleSeries.flatMap((s) =>
        rows.flatMap((r) =>
            [r[s.key], s.adjustedKey ? r[s.adjustedKey] : null].filter(
                (value): value is number => value != null,
            ),
        ),
    );
    if (kind === "stacked") {
        for (const row of rows) {
            const known = visibleSeries
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
        <Surface
            as="section"
            aria-label={title}
            className="w-full min-w-0 max-w-4xl p-4 sm:p-5"
        >
            <div className="flex h-52 flex-col">
                <div className="flex h-12 shrink-0 items-start justify-between gap-2">
                    <Heading as="h3" size="card" className="min-w-0 !text-lg">
                        {title}
                    </Heading>
                    {scope && onScopeChange && (
                        <fieldset
                            className="ml-auto flex shrink-0 gap-1"
                            aria-label={`${title} scope`}
                        >
                            {(["product", "company"] as const).map((value) => (
                                <TabButton
                                    key={value}
                                    active={scope === value}
                                    onClick={() => onScopeChange(value)}
                                    size="xs"
                                    variant="soft"
                                    aria-label={
                                        value === "product"
                                            ? "Product"
                                            : "Whole company"
                                    }
                                >
                                    {value === "product"
                                        ? "Product"
                                        : "Whole company"}
                                </TabButton>
                            ))}
                        </fieldset>
                    )}
                </div>
                <div className="flex min-h-0 flex-1 flex-col rounded-lg bg-black/10 p-2.5 dark:bg-white/5">
                    <div className="mb-2 flex shrink-0 items-baseline justify-between gap-2">
                        <h4 className="text-sm font-semibold">
                            {active ? monthName(active.month) : "Months"}
                        </h4>
                        <span className="text-xs text-theme-text-soft">
                            {provisional(active) || provisional(previousRow)
                                ? "Provisional · comparison pending"
                                : active
                                  ? `vs ${monthName(monthShift(active.month, -1))}`
                                  : ""}
                        </span>
                    </div>
                    <div
                        className="min-h-0 space-y-0.5 overflow-y-auto text-xs tabular-nums"
                        aria-live="polite"
                    >
                        {series.map((s) => {
                            const change =
                                provisional(active) || provisional(previousRow)
                                    ? null
                                    : trendPercentChange(
                                          active?.[s.key],
                                          previousRow?.[s.key],
                                      );
                            const rounded =
                                change == null
                                    ? null
                                    : Math.round(change * 10) / 10;
                            return (
                                <div
                                    key={s.key}
                                    className={
                                        hiddenSeries.includes(s.key)
                                            ? "opacity-40"
                                            : ""
                                    }
                                >
                                    <LegendItem
                                        type={
                                            onToggleSeries
                                                ? "button"
                                                : undefined
                                        }
                                        aria-label={
                                            onToggleSeries
                                                ? `Toggle ${s.label}`
                                                : undefined
                                        }
                                        aria-pressed={
                                            onToggleSeries
                                                ? !hiddenSeries.includes(s.key)
                                                : undefined
                                        }
                                        onClick={
                                            onToggleSeries
                                                ? () => onToggleSeries(s.key)
                                                : undefined
                                        }
                                        className={`grid w-full grid-cols-[minmax(0,1fr)_auto_4.5rem] items-baseline gap-2 text-left ${onToggleSeries ? "cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current" : ""}`}
                                    >
                                        <span className="flex min-w-0 items-center gap-1.5 text-theme-text-soft">
                                            <svg
                                                width="18"
                                                height="10"
                                                className="shrink-0"
                                                aria-hidden="true"
                                            >
                                                <line
                                                    x1="0"
                                                    x2="18"
                                                    y1="5"
                                                    y2="5"
                                                    stroke={s.color}
                                                    strokeWidth="3"
                                                    strokeDasharray={
                                                        s.dashed
                                                            ? "4 2"
                                                            : undefined
                                                    }
                                                />
                                            </svg>
                                            <span>{s.label}</span>
                                        </span>
                                        <strong className="whitespace-nowrap">
                                            {format(active?.[s.key])}
                                        </strong>
                                        <span
                                            className={`whitespace-nowrap text-right ${rounded == null || rounded === 0 ? "text-theme-text-soft" : rounded > 0 ? "text-outcome-positive-text" : "text-outcome-negative-text"}`}
                                        >
                                            {rounded == null
                                                ? "—"
                                                : `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${Math.abs(rounded).toLocaleString("en-US")}%`}
                                        </span>
                                    </LegendItem>
                                    {s.adjustedKey &&
                                        active?.[s.adjustedKey] != null && (
                                            <div className="mt-0.5 pl-6 text-theme-text-soft">
                                                ◇ {usd(active[s.adjustedKey])}{" "}
                                                excluding fraud
                                            </div>
                                        )}
                                </div>
                            );
                        })}
                        {funded != null &&
                            total != null &&
                            total > 0 &&
                            funded >= 0 &&
                            funded <= total && (
                                <p className="text-theme-text-soft">
                                    {Math.round((100 * funded) / total)}% funded
                                    by credits
                                </p>
                            )}
                        {note && <p className="text-theme-text-soft">{note}</p>}
                    </div>
                </div>
            </div>
            <TrendPlot
                rows={rows}
                activeMonth={activeMonth}
                onInspect={onInspect}
                label={`${title}. ${unit} by month; select a month to inspect values.`}
            >
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
                            fontSize="16"
                        >
                            {unit === "Pollen"
                                ? fmtNumber(value)
                                : axisUsd(value)}
                        </text>
                    </g>
                ))}
                {visibleSeries.map((s, j) => (
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
                                                    previous[s.key] as number,
                                                )}
                                                y2={y(value)}
                                                stroke={s.color}
                                                strokeWidth="2.5"
                                                strokeDasharray={
                                                    s.dashed ? "6 4" : undefined
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
                                            opacity={
                                                provisional(row) ? 0.65 : 1
                                            }
                                        />
                                    </g>
                                );
                            const base =
                                kind === "stacked"
                                    ? visibleSeries
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
                                      (j - visibleSeries.length / 2) *
                                          (barWidth + 2);
                            const adjusted = s.adjustedKey
                                ? row[s.adjustedKey]
                                : null;
                            return (
                                <g key={row.month}>
                                    <rect
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
                                        opacity={provisional(row) ? 0.65 : 1}
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
            </TrendPlot>
        </Surface>
    );
}

export function TrendsTab({
    data,
    period,
    onPeriodChange,
    issues = [],
    initialMonth,
}: {
    data: Data;
    issues?: ReconciliationIssue[];
    initialMonth?: string;
    period: 3 | 6 | 12;
    onPeriodChange: (period: 3 | 6 | 12) => void;
}) {
    const [resultScope, setResultScope] = useState<TrendScope>("company");
    const [fundingScope, setFundingScope] = useState<TrendScope>("company");
    const [hiddenSeries, setHiddenSeries] = useState<Series["key"][]>([]);
    const [activeMonth, setActiveMonth] = useState<string | null>(
        initialMonth ?? null,
    );
    const months = useMemo(() => {
        const now = new Date();
        const company = monthlyTrends(data, "company", now).months;
        const product = monthlyTrends(data, "product", now).months;
        const pollen = monthlyPollenTrends(
            data,
            company.map((row) => row.month),
        );
        const missingUsageMonths = new Set(
            company
                .filter((row) =>
                    unitEconomicsReport(
                        data,
                        row.month,
                        "vendors",
                    ).blockers.some((blocker) => blocker.kind === "usage"),
                )
                .map((row) => row.month),
        );
        const withPollen = (rows: TrendMonth[]): TrendRow[] =>
            rows.map((row, i) => {
                const overhead = EXPENSE_CATEGORY_ORDER.filter(
                    (category) => !isComputeOrInfrastructureCategory(category),
                ).map((category) => row[category]);
                return {
                    ...row,
                    ...pollen[i],
                    salesProvisional:
                        row.issues.some((message) =>
                            message.includes("Stripe"),
                        ) ||
                        issues.some(
                            (issue) =>
                                issue.month === row.month &&
                                issue.group === "financial" &&
                                issue.vendor === "Stripe",
                        ),
                    pollenProvisional:
                        missingUsageMonths.has(row.month) ||
                        issues.some(
                            (issue) =>
                                issue.month === row.month &&
                                issue.group === "financial" &&
                                issue.affects.includes("op-pollen"),
                        ),
                    provisional:
                        row.provisional ||
                        issues.some(
                            (issue) =>
                                issue.month === row.month &&
                                issue.group === "financial" &&
                                issue.affects.includes("trends"),
                        ),
                    overhead: overhead.every((cost) => cost != null)
                        ? overhead.reduce<number>(
                              (sum, cost) => sum + (cost ?? 0),
                              0,
                          )
                        : null,
                };
            });
        return {
            company: withPollen(company),
            product: withPollen(product),
            mix: monthlyProductMix(
                data,
                company.map((row) => row.month),
            ),
        };
    }, [data, issues]);
    const { start, end } = trendPeriod(period);
    const scopeRows = {
        company: months.company.filter(
            (row) => row.month >= start && row.month <= end,
        ),
        product: months.product.filter(
            (row) => row.month >= start && row.month <= end,
        ),
    };
    const rows = scopeRows.company;
    const selected =
        rows.find((row) => row.month === activeMonth) ?? rows.at(-1);
    const previousMonth = selected ? monthShift(selected.month, -1) : null;
    const previousRow = (scope: TrendScope) =>
        months[scope].find((row) => row.month === previousMonth);
    const chartProps = {
        previousRow: previousRow("company"),
        rows,
        activeMonth: selected?.month ?? null,
        onInspect: setActiveMonth,
    };
    return (
        <section className="@container flex flex-col gap-5">
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
            <div className="grid min-w-0 grid-cols-1 gap-5 @3xl:grid-cols-2 @6xl:grid-cols-3">
                <TrendChart
                    title="Monthly result"
                    series={RESULT_SERIES}
                    kind="bar"
                    {...chartProps}
                    rows={scopeRows[resultScope]}
                    previousRow={previousRow(resultScope)}
                    scope={resultScope}
                    onScopeChange={setResultScope}
                />
                <TrendChart
                    title="Expenses before credits"
                    series={EXPENSE_SERIES}
                    hiddenSeries={hiddenSeries}
                    onToggleSeries={(key) =>
                        setHiddenSeries((hidden) =>
                            hidden.includes(key)
                                ? hidden.filter((item) => item !== key)
                                : [...hidden, key],
                        )
                    }
                    {...chartProps}
                />
                <TrendChart
                    title="Cost funding"
                    series={FUNDING_SERIES}
                    kind="stacked"
                    creditKey="credits"
                    {...chartProps}
                    rows={scopeRows[fundingScope]}
                    previousRow={previousRow(fundingScope)}
                    scope={fundingScope}
                    onScopeChange={setFundingScope}
                />
                <TrendChart
                    title="Sales"
                    series={SALES_SERIES}
                    {...chartProps}
                />
                <ProductMixCard
                    rows={months.mix.filter(
                        (row) => row.month >= start && row.month <= end,
                    )}
                    activeMonth={selected?.month ?? null}
                    previous={months.mix.find(
                        (row) => row.month === previousMonth,
                    )}
                    onInspect={setActiveMonth}
                />
                <TrendChart
                    title="Pollen consumed"
                    note="Usage, not sales"
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
